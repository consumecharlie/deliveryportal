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
import { DepartmentBadge } from "./department-badge";
import { Avatar } from "./assignee-filter";
import { ExternalLink, AlertCircle } from "lucide-react";

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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delivery Details</DialogTitle>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4">
              <div className="space-y-1 text-sm">
                <div>
                  <strong>To: </strong>
                  {selectedDelivery.primaryEmail}
                </div>
                {selectedDelivery.ccEmails && (
                  <div>
                    <strong>CC: </strong>
                    {selectedDelivery.ccEmails}
                  </div>
                )}
                <div>
                  <strong>Sent As: </strong>
                  {selectedDelivery.senderEmail}
                </div>
                <div>
                  <strong>Sent By: </strong>
                  {selectedDelivery.sentBy}
                </div>
                <div>
                  <strong>Sent At: </strong>
                  {formatDate(selectedDelivery.sentAt)}
                </div>
                {selectedDelivery.slackChannel && (
                  <div>
                    <strong>Slack: </strong>#
                    {selectedDelivery.slackChannelName ||
                      selectedDelivery.slackChannel}
                  </div>
                )}
                {selectedDelivery.wasEdited && (
                  <Badge variant="outline">Edited from template</Badge>
                )}
              </div>
              <div>
                <p className="text-sm font-medium mb-1">
                  Subject: {selectedDelivery.emailSubject}
                </p>
                <pre className="text-sm bg-muted p-3 rounded whitespace-pre-wrap font-sans">
                  {selectedDelivery.emailContent}
                </pre>
              </div>
              {selectedDelivery.links.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Review Links:</p>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
