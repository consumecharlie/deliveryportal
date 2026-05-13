"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import PacmanLoader from "@/components/ui/pacman-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DepartmentBadge } from "./department-badge";
import { Avatar } from "./assignee-filter";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { ExternalLink, AlertCircle, Mail, MessageSquare } from "lucide-react";

interface DeliveryLink {
  id: string;
  url: string;
  label: string;
  linkType: string;
}

interface Delivery {
  id: string;
  taskId: string;
  projectName: string;
  clientName: string;
  deliverableType: string;
  department: string;
  senderEmail: string;
  primaryEmail: string;
  ccEmails: string | null;
  slackChannel: string | null;
  slackChannelName: string | null;
  emailSubject: string;
  emailContent: string;
  slackContent: string | null;
  wasEdited: boolean;
  sentBy: string;
  sentAt: string;
  n8nStatus: string | null;
  links: DeliveryLink[];
}

interface ClickUpMember {
  id: number;
  username: string;
  email: string;
  profilePicture?: string;
  initials: string;
}

interface SlackMember {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  avatar?: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Pull Slack user IDs out of `<@UXXXX>` tokens in a slack-mrkdwn body. */
function extractSlackMentionIds(slackContent: string | null): string[] {
  if (!slackContent) return [];
  const ids = new Set<string>();
  for (const m of slackContent.matchAll(/<@([A-Z0-9]+)>/g)) {
    ids.add(m[1]);
  }
  return Array.from(ids);
}

/**
 * Adapt Slack mrkdwn → markdown the RichTextEditor can render.
 *
 * Reverses the transformations applied at send time by
 * `convertToSlackFormat()` so we can preview a saved slack message:
 *   - `<@UXXXX>`     → `@[Display Name](UXXXX)` (TipTap mention chip)
 *   - `<url|text>`   → `[text](url)`
 *   - `<url>`        → plain url
 *   - `*bold*`       → `**bold**` (single-asterisk → markdown double)
 */
function slackContentToMarkdown(
  slack: string,
  lookupSlackUser: (
    id: string
  ) => { name: string; avatar?: string } | undefined
): string {
  let out = slack;
  // Mentions
  out = out.replace(/<@([A-Z0-9]+)>/g, (_, id) => {
    const name = lookupSlackUser(id)?.name ?? id;
    return `@[${name}](${id})`;
  });
  // Slack links with display text: <url|text>
  out = out.replace(/<([^|>\s]+)\|([^>]+)>/g, (_, url, text) => `[${text}](${url})`);
  // Plain bracketed urls: <https://…>
  out = out.replace(/<(https?:\/\/[^>\s]+)>/g, (_, url) => url);
  // Slack single-asterisk bold → markdown double-asterisk bold. Match
  // `*text*` where the surrounding chars aren't asterisks (so we don't
  // disturb existing `**bold**` pairs).
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1**$2**");
  return out;
}

/** Headers get the NAVIGATION-style pixel-7 treatment. */
const headerClass = "font-pixel text-[13px] tracking-[0.18em] py-3";
const headerStyle = { color: "#6AC387" };

/** Row cells get extra vertical padding so the table isn't crowded. */
const cellClass = "py-4";

export function SentTable() {
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(
    null
  );

  const { data, isLoading, error } = useQuery<{
    deliveries: Delivery[];
    total: number;
  }>({
    queryKey: ["deliveries"],
    queryFn: async () => {
      const res = await fetch("/api/deliveries");
      if (!res.ok) throw new Error("Failed to fetch deliveries");
      return res.json();
    },
  });

  // ClickUp workspace members — used to resolve Sent By / Sent As emails
  // to real names and profile pictures.
  const { data: clickupData } = useQuery<{ members: ClickUpMember[] }>({
    queryKey: ["settings", "workspace-members"],
    queryFn: async () => {
      const res = await fetch("/api/settings/workspace-members");
      if (!res.ok) throw new Error("Failed to fetch workspace members");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // Slack workspace members — used to resolve <@userId> mentions inside
  // slack messages into real names + avatars.
  const { data: slackData } = useQuery<{ members: SlackMember[] }>({
    queryKey: ["slack", "members"],
    queryFn: async () => {
      const res = await fetch("/api/slack/members");
      if (!res.ok) throw new Error("Failed to fetch Slack members");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const clickupByEmail = useMemo(() => {
    const map = new Map<
      string,
      { name: string; avatar?: string }
    >();
    for (const m of clickupData?.members ?? []) {
      if (m.email) {
        map.set(m.email.toLowerCase(), {
          name: m.username || m.email,
          avatar: m.profilePicture,
        });
      }
    }
    return map;
  }, [clickupData]);

  const slackByUserId = useMemo(() => {
    const map = new Map<string, { name: string; avatar?: string }>();
    for (const m of slackData?.members ?? []) {
      map.set(m.id, {
        name: m.realName || m.displayName || m.name,
        avatar: m.avatar,
      });
    }
    return map;
  }, [slackData]);

  // Collect every Slack mention ID across visible deliveries, then strip
  // out the ones we already have from the workspace members list. The
  // remaining IDs are external Slack Connect users (MarginEdge, AVOXI,
  // Fullstory, ...) — those only resolve via users.info, not users.list.
  const unresolvedIds = useMemo(() => {
    const deliveries = data?.deliveries ?? [];
    const all = new Set<string>();
    for (const d of deliveries) {
      if (!d.slackChannel) continue;
      for (const id of extractSlackMentionIds(d.slackContent)) {
        all.add(id);
      }
    }
    return Array.from(all)
      .filter((id) => !slackByUserId.has(id))
      .sort();
  }, [data, slackByUserId]);

  const { data: resolvedData } = useQuery<{
    users: Array<{ id: string; name: string; avatar?: string }>;
  }>({
    queryKey: ["slack", "resolve-users", unresolvedIds],
    queryFn: async () => {
      const res = await fetch("/api/slack/resolve-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unresolvedIds }),
      });
      if (!res.ok) throw new Error("Failed to resolve Slack users");
      return res.json();
    },
    enabled: unresolvedIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const resolvedById = useMemo(() => {
    const map = new Map<string, { name: string; avatar?: string }>();
    for (const u of resolvedData?.users ?? []) {
      map.set(u.id, { name: u.name, avatar: u.avatar });
    }
    return map;
  }, [resolvedData]);

  // Combined lookup — prefer workspace-members entries (faster, already
  // cached) over the secondary resolver.
  function lookupSlackUser(
    id: string
  ): { name: string; avatar?: string } | undefined {
    return slackByUserId.get(id) ?? resolvedById.get(id);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <PacmanLoader size={32} />
        <span
          className="font-pixel text-[13px]"
          style={{ color: "#6AC387" }}
        >
          LOADING SENT
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Unable to load sent deliveries. Database may not be connected yet.
      </div>
    );
  }

  const deliveries = data?.deliveries ?? [];

  if (deliveries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No deliveries sent yet. Sent deliveries will appear here.
      </div>
    );
  }

  function renderPerson(email: string | null | undefined) {
    if (!email) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    const lookup = clickupByEmail.get(email.toLowerCase());
    const name = lookup?.name ?? email;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <Avatar src={lookup?.avatar} name={name} size={22} />
        <span className="truncate text-sm" title={email}>
          {name}
        </span>
      </div>
    );
  }

  function renderRecipients(delivery: Delivery) {
    // Slack mode: parse <@userId> mentions from the slack body and render
    // an avatar + name stack. Falls back to the @handle if the user isn't
    // in our Slack member list.
    if (delivery.slackChannel) {
      const ids = extractSlackMentionIds(delivery.slackContent);
      if (ids.length === 0) {
        return <span className="text-xs text-muted-foreground">—</span>;
      }
      return (
        <div className="flex items-center gap-2 min-w-0">
          {ids.slice(0, 3).map((id) => {
            const lookup = lookupSlackUser(id);
            const name = lookup?.name ?? id;
            return (
              <div key={id} className="flex items-center gap-1.5 min-w-0">
                <Avatar src={lookup?.avatar} name={name} size={20} />
                <span className="truncate text-xs" title={name}>
                  {name}
                </span>
              </div>
            );
          })}
          {ids.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{ids.length - 3}
            </span>
          )}
        </div>
      );
    }

    // Email mode: show the primary recipient (truncated).
    if (!delivery.primaryEmail) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    return (
      <span
        className="truncate text-sm block max-w-[220px]"
        title={delivery.primaryEmail}
      >
        {delivery.primaryEmail}
      </span>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={headerClass} style={headerStyle}>
                CLIENT
              </TableHead>
              <TableHead className={headerClass} style={headerStyle}>
                PROJECT
              </TableHead>
              <TableHead className={headerClass} style={headerStyle}>
                TYPE
              </TableHead>
              <TableHead className={headerClass} style={headerStyle}>
                DEPT
              </TableHead>
              <TableHead className={headerClass} style={headerStyle}>
                SENT BY
              </TableHead>
              <TableHead className={headerClass} style={headerStyle}>
                SENT AS
              </TableHead>
              <TableHead className={headerClass} style={headerStyle}>
                SENT AT
              </TableHead>
              <TableHead className={headerClass} style={headerStyle}>
                RECIPIENTS
              </TableHead>
              <TableHead className={headerClass} style={headerStyle}>
                SLACK
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => {
              const hadError = delivery.n8nStatus === "error";
              return (
                <TableRow
                  key={delivery.id}
                  onClick={() => setSelectedDelivery(delivery)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className={`${cellClass} font-medium`}>
                    <span className="flex items-center gap-2">
                      {hadError && (
                        <AlertCircle
                          className="h-3.5 w-3.5 text-destructive shrink-0"
                          aria-label="Send error"
                        />
                      )}
                      {delivery.clientName || "—"}
                    </span>
                  </TableCell>
                  <TableCell className={cellClass}>
                    {delivery.projectName || "—"}
                  </TableCell>
                  <TableCell className={`${cellClass} text-sm text-muted-foreground`}>
                    {delivery.deliverableType || "—"}
                  </TableCell>
                  <TableCell className={cellClass}>
                    <DepartmentBadge department={delivery.department} />
                  </TableCell>
                  <TableCell className={cellClass}>
                    {renderPerson(delivery.sentBy)}
                  </TableCell>
                  <TableCell className={cellClass}>
                    {renderPerson(delivery.senderEmail)}
                  </TableCell>
                  <TableCell className={`${cellClass} text-sm text-muted-foreground whitespace-nowrap`}>
                    {formatDate(delivery.sentAt)}
                  </TableCell>
                  <TableCell className={cellClass}>
                    {renderRecipients(delivery)}
                  </TableCell>
                  <TableCell className={cellClass}>
                    {delivery.slackChannel ? (
                      <Badge variant="outline" className="text-xs">
                        #{delivery.slackChannelName || delivery.slackChannel}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Delivery detail dialog */}
      <Dialog
        open={!!selectedDelivery}
        onOpenChange={(open) => !open && setSelectedDelivery(null)}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          {selectedDelivery && (() => {
            const sentByLookup = clickupByEmail.get(
              selectedDelivery.sentBy?.toLowerCase() ?? ""
            );
            const sentAsLookup = clickupByEmail.get(
              selectedDelivery.senderEmail?.toLowerCase() ?? ""
            );
            const hasSlack = Boolean(
              selectedDelivery.slackChannel && selectedDelivery.slackContent
            );
            const slackMarkdown = hasSlack
              ? slackContentToMarkdown(
                  selectedDelivery.slackContent ?? "",
                  lookupSlackUser
                )
              : "";
            const defaultTab = hasSlack ? "slack" : "email";
            const channelLabel = selectedDelivery.slackChannel
              ? `#${selectedDelivery.slackChannelName || selectedDelivery.slackChannel}`
              : null;
            return (
              <>
                <DialogHeader className="px-6 pt-5 pb-3 border-b">
                  <DialogTitle className="text-base">
                    {selectedDelivery.clientName || "Delivery"}
                    {selectedDelivery.projectName ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        / {selectedDelivery.projectName}
                      </span>
                    ) : null}
                  </DialogTitle>
                </DialogHeader>

                {/* Metadata header */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-4 border-b text-sm">
                  <div>
                    <p className="text-[10px] font-pixel tracking-[0.18em] mb-1" style={{ color: "#6AC387" }}>
                      SENT BY
                    </p>
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        src={sentByLookup?.avatar}
                        name={sentByLookup?.name ?? selectedDelivery.sentBy}
                        size={22}
                      />
                      <span className="truncate" title={selectedDelivery.sentBy}>
                        {sentByLookup?.name ?? selectedDelivery.sentBy}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-pixel tracking-[0.18em] mb-1" style={{ color: "#6AC387" }}>
                      SENT AS
                    </p>
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        src={sentAsLookup?.avatar}
                        name={sentAsLookup?.name ?? selectedDelivery.senderEmail}
                        size={22}
                      />
                      <span className="truncate" title={selectedDelivery.senderEmail}>
                        {sentAsLookup?.name ?? selectedDelivery.senderEmail}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-pixel tracking-[0.18em] mb-1" style={{ color: "#6AC387" }}>
                      SENT AT
                    </p>
                    <p>{formatDate(selectedDelivery.sentAt)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-pixel tracking-[0.18em] mb-1" style={{ color: "#6AC387" }}>
                      DEPARTMENT
                    </p>
                    <DepartmentBadge department={selectedDelivery.department} />
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-pixel tracking-[0.18em] mb-1" style={{ color: "#6AC387" }}>
                      RECIPIENTS
                    </p>
                    <div className="space-y-0.5">
                      <p>
                        <span className="text-muted-foreground">To: </span>
                        {selectedDelivery.primaryEmail || "—"}
                      </p>
                      {selectedDelivery.ccEmails && (
                        <p>
                          <span className="text-muted-foreground">CC: </span>
                          {selectedDelivery.ccEmails}
                        </p>
                      )}
                      {channelLabel && (
                        <p>
                          <span className="text-muted-foreground">Slack: </span>
                          <Badge variant="outline" className="text-xs">
                            {channelLabel}
                          </Badge>
                        </p>
                      )}
                    </div>
                  </div>
                  {selectedDelivery.wasEdited && (
                    <div className="col-span-2">
                      <Badge variant="outline" className="text-xs">
                        Edited from template
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Subject */}
                <div className="px-6 py-3 border-b">
                  <p className="text-[10px] font-pixel tracking-[0.18em] mb-1" style={{ color: "#6AC387" }}>
                    SUBJECT
                  </p>
                  <p className="font-medium">
                    {selectedDelivery.emailSubject || "—"}
                  </p>
                </div>

                {/* Rendered preview — uses the same RichTextEditor as the
                    delivery form's preview panel, in read-only mode. */}
                <Tabs defaultValue={defaultTab}>
                  {hasSlack && (
                    <div className="px-6 pt-3 border-b">
                      <TabsList className="h-9">
                        <TabsTrigger value="email" className="text-xs">
                          <Mail className="mr-1 h-3 w-3" /> Email
                        </TabsTrigger>
                        <TabsTrigger value="slack" className="text-xs">
                          <MessageSquare className="mr-1 h-3 w-3" /> Slack
                        </TabsTrigger>
                      </TabsList>
                    </div>
                  )}

                  <TabsContent value="email" className="m-0 px-6 py-4">
                    <RichTextEditor
                      content={selectedDelivery.emailContent}
                      onChange={() => {}}
                      editable={false}
                      outputFormat="markdown"
                      showToolbar={false}
                      minHeight="auto"
                    />
                  </TabsContent>
                  {hasSlack && (
                    <TabsContent value="slack" className="m-0 px-6 py-4">
                      <RichTextEditor
                        content={slackMarkdown}
                        onChange={() => {}}
                        editable={false}
                        outputFormat="markdown"
                        showToolbar={false}
                        minHeight="auto"
                      />
                    </TabsContent>
                  )}
                </Tabs>

                {selectedDelivery.links.length > 0 && (
                  <div className="px-6 py-4 border-t">
                    <p className="text-[10px] font-pixel tracking-[0.18em] mb-2" style={{ color: "#6AC387" }}>
                      REVIEW LINKS
                    </p>
                    <ul className="space-y-1">
                      {selectedDelivery.links.map((link) => (
                        <li key={link.id} className="text-sm">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary inline-flex items-center gap-1 hover:underline"
                          >
                            {link.label || link.url}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
