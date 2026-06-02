"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { SLACK_EMOJI_MAP } from "@/lib/template-merge";
import { DepartmentBadge } from "./department-badge";
import { Avatar } from "./assignee-filter";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { ExternalLink, AlertCircle, Mail, MessageSquare, Bookmark, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
  projectListId: string | null;
  /** When this delivery is a resend, points to the original Delivery it corrected. */
  replacesDeliveryId: string | null;
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
 * Slack shortcode → Unicode emoji map. Inverted from SLACK_EMOJI_MAP so
 * we can render shortcodes back to their actual emoji in the preview.
 */
const SHORTCODE_TO_EMOJI: Record<string, string> = Object.fromEntries(
  Object.entries(SLACK_EMOJI_MAP).map(([unicode, code]) => [code, unicode])
);

/**
 * Adapt Slack mrkdwn → markdown the RichTextEditor can render.
 *
 * Reverses the transformations applied at send time by
 * `convertToSlackFormat()` so we can preview a saved slack message:
 *   - `:shortcode:`  → unicode emoji (when in our SLACK_EMOJI_MAP)
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
  // Emoji shortcodes — apply BEFORE link/mention conversions so that
  // emoji codes adjacent to brackets aren't accidentally caught by the
  // other regexes.
  out = out.replace(/:[a-z0-9_+\-]+:/gi, (m) => SHORTCODE_TO_EMOJI[m] ?? m);
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
  // We track WHICH delivery is open by id and DERIVE the dialog payload
  // from the loaded data. The id is initialized from the URL's `?open=`
  // param so other pages can deep-link straight into a delivery's
  // dialog (used by the analytics activity log). Avoids the setState-
  // inside-useEffect cascading-renders lint error.
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(
    () => searchParams.get("open")
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

  const selectedDelivery = useMemo(() => {
    if (!selectedDeliveryId || !data?.deliveries) return null;
    return data.deliveries.find((d) => d.id === selectedDeliveryId) ?? null;
  }, [selectedDeliveryId, data]);

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
        <PacmanLoader size={120} />
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
                  onClick={() => setSelectedDeliveryId(delivery.id)}
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
                    <span className="inline-flex items-center gap-2">
                      {delivery.deliverableType || "—"}
                      {delivery.replacesDeliveryId && (
                        <span
                          className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-pixel tracking-[0.18em] text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          title="This delivery resent a prior one"
                        >
                          RESENT
                        </span>
                      )}
                    </span>
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
        onOpenChange={(open) => !open && setSelectedDeliveryId(null)}
      >
        <DialogContent className="!max-w-[min(1350px,85vw)] !w-[85vw] max-h-[90vh] p-0 gap-0 overflow-hidden">
          {selectedDelivery && (() => {
            const sentByLookup = clickupByEmail.get(
              selectedDelivery.sentBy?.toLowerCase() ?? ""
            );
            const sentAsLookup = clickupByEmail.get(
              selectedDelivery.senderEmail?.toLowerCase() ?? ""
            );
            // A delivery was sent via Slack iff it has BOTH a channel and
            // slack body. Everything else was an email send. We never
            // send both routes, so we show one preview only.
            const wasSlack = Boolean(
              selectedDelivery.slackChannel && selectedDelivery.slackContent
            );
            const slackMarkdown = wasSlack
              ? slackContentToMarkdown(
                  selectedDelivery.slackContent ?? "",
                  lookupSlackUser
                )
              : "";
            const channelLabel = selectedDelivery.slackChannel
              ? `#${selectedDelivery.slackChannelName || selectedDelivery.slackChannel}`
              : null;
            return (
              <>
                <DialogHeader className="px-8 pt-6 pb-4 border-b">
                  <DialogTitle className="text-base flex items-center gap-2 pr-10">
                    <span>
                      {selectedDelivery.clientName || "Delivery"}
                      {selectedDelivery.projectName ? (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          / {selectedDelivery.projectName}
                        </span>
                      ) : null}
                    </span>
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-pixel tracking-[0.18em] text-muted-foreground">
                      {wasSlack ? (
                        <>
                          <MessageSquare className="h-3 w-3" /> SLACK
                        </>
                      ) : (
                        <>
                          <Mail className="h-3 w-3" /> EMAIL
                        </>
                      )}
                    </span>
                    {selectedDelivery.replacesDeliveryId && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedDeliveryId(selectedDelivery.replacesDeliveryId)
                        }
                        className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-pixel tracking-[0.18em] text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                        title="This delivery resent an earlier one — click to view the original"
                      >
                        RESENT · VIEW ORIGINAL
                      </button>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!confirm("Resend this delivery? This opens the form prefilled with the prior values so you can correct what was wrong before sending again.")) return;
                          router.push(
                            `/deliverable/${selectedDelivery.taskId}?resendFrom=${selectedDelivery.id}`
                          );
                        }}
                      >
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        Resend
                      </Button>
                      {selectedDelivery.projectListId && (
                        <Link
                          href={`/projects/${selectedDelivery.projectListId}`}
                          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                          title="Open project links"
                        >
                          <Bookmark className="h-3.5 w-3.5" />
                          Project links
                        </Link>
                      )}
                    </div>
                  </DialogTitle>
                </DialogHeader>

                {/* Two-column layout: details left, preview right. The
                    preview column is the only thing that scrolls, so
                    long messages don't drag the metadata out of view. */}
                <div className="flex max-h-[calc(90vh-4.25rem)]">
                  {/* LEFT — details column */}
                  <div className="w-[320px] shrink-0 border-r overflow-y-auto">
                    <div className="px-7 py-6 space-y-6 text-sm">
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
                      <div>
                        <p className="text-[10px] font-pixel tracking-[0.18em] mb-1" style={{ color: "#6AC387" }}>
                          RECIPIENTS
                        </p>
                        <div className="space-y-0.5">
                          {wasSlack ? (
                            channelLabel && (
                              <p>
                                <Badge variant="outline" className="text-xs">
                                  {channelLabel}
                                </Badge>
                              </p>
                            )
                          ) : (
                            <>
                              <p className="break-all">
                                <span className="text-muted-foreground">To: </span>
                                {selectedDelivery.primaryEmail || "—"}
                              </p>
                              {selectedDelivery.ccEmails && (
                                <p className="break-all">
                                  <span className="text-muted-foreground">CC: </span>
                                  {selectedDelivery.ccEmails}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-pixel tracking-[0.18em] mb-1" style={{ color: "#6AC387" }}>
                          SUBJECT
                        </p>
                        <p className="font-medium">
                          {selectedDelivery.emailSubject || "—"}
                        </p>
                      </div>
                      {selectedDelivery.wasEdited && (
                        <div>
                          <Badge variant="outline" className="text-xs">
                            Edited from template
                          </Badge>
                        </div>
                      )}
                      {selectedDelivery.links.length > 0 && (
                        <div>
                          <p className="text-[10px] font-pixel tracking-[0.18em] mb-1.5" style={{ color: "#6AC387" }}>
                            REVIEW LINKS
                          </p>
                          <ul className="space-y-1">
                            {selectedDelivery.links.map((link) => (
                              <li key={link.id} className="text-sm">
                                <a
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary inline-flex items-center gap-1 hover:underline break-all"
                                >
                                  {link.label || link.url}
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT — rendered preview, scrolls independently */}
                  <div className="flex-1 overflow-y-auto px-10 py-6 min-w-0">
                    <RichTextEditor
                      content={
                        wasSlack ? slackMarkdown : selectedDelivery.emailContent
                      }
                      onChange={() => {}}
                      editable={false}
                      outputFormat="markdown"
                      showToolbar={false}
                      minHeight="auto"
                    />
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
