"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import PacmanLoader from "@/components/ui/pacman-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  ExternalLink,
  Link as LinkIcon,
  Send,
} from "lucide-react";
import { DepartmentBadge } from "@/components/dashboard/department-badge";
import { Avatar } from "@/components/dashboard/assignee-filter";

interface DeliveryLink {
  id: string;
  url: string;
  label: string;
  linkType: string;
  variableName: string | null;
}

interface ProjectDelivery {
  id: string;
  deliverableType: string;
  department: string;
  sentAt: string;
  sentBy: string;
  senderEmail: string;
  primaryEmail: string;
  emailSubject: string;
  slackChannel: string | null;
  slackChannelName: string | null;
  links: DeliveryLink[];
}

interface FlatLink {
  url: string;
  label: string;
  linkType: string;
  variableName: string | null;
  deliverableType: string;
  sentAt: string;
  deliveryId: string;
}

const LINK_LABELS: Record<string, string> = {
  googleDeliverableLink: "Google Deliverable",
  frameReviewLink: "Frame.io Review",
  loomReviewLink: "Loom Walkthrough",
  animaticReviewLink: "Animatic",
  flexLink: "Flex Link",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const listId = params.listId as string;

  const { data, isLoading, error } = useQuery<{
    projectName: string | null;
    deliveries: ProjectDelivery[];
    allLinks: FlatLink[];
    total: number;
  }>({
    queryKey: ["project-links", listId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${listId}/links`);
      if (!res.ok) throw new Error("Failed to fetch project data");
      return res.json();
    },
  });

  // Workspace members for resolving sentBy email → profile picture in the
  // Delivery History "By" column.
  const { data: membersData } = useQuery<{
    members: Array<{ email: string; profilePicture?: string; username: string }>;
  }>({
    queryKey: ["settings", "workspace-members"],
    queryFn: async () => {
      const res = await fetch("/api/settings/workspace-members");
      if (!res.ok) throw new Error("Failed to fetch workspace members");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const memberByEmail = useMemo(() => {
    const m = new Map<string, { profilePicture?: string; username: string }>();
    for (const member of membersData?.members ?? []) {
      if (member.email) {
        m.set(member.email.toLowerCase(), {
          profilePicture: member.profilePicture,
          username: member.username,
        });
      }
    }
    return m;
  }, [membersData]);

  const projectName = data?.projectName ?? null;
  const deliveries = data?.deliveries ?? [];
  const allLinks = data?.allLinks ?? [];

  // De-duplicate links by URL for the summary card
  const uniqueLinks = allLinks.reduce<
    Map<string, FlatLink & { count: number }>
  >((acc, link) => {
    const existing = acc.get(link.url);
    if (existing) {
      existing.count++;
    } else {
      acc.set(link.url, { ...link, count: 1 });
    }
    return acc;
  }, new Map());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/projects")}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="font-eighties text-3xl">
            {projectName ?? "Project Deliveries"}
          </h1>
          <p className="text-sm text-muted-foreground">
            All deliveries and links sent for this project.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <PacmanLoader size={32} />
          <span className="font-pixel text-[13px]" style={{ color: "#6AC387" }}>LOADING PROJECT</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-12 text-destructive">
          Failed to load project data. The database may not be connected.
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{deliveries.length}</p>
                    <p className="text-xs text-muted-foreground">
                      Deliveries Sent
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{allLinks.length}</p>
                    <p className="text-xs text-muted-foreground">
                      Total Links Sent
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{uniqueLinks.size}</p>
                    <p className="text-xs text-muted-foreground">
                      Unique Links
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* All Unique Links */}
          {uniqueLinks.size > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  All Links
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Array.from(uniqueLinks.values()).map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-[#6AC387]/10 hover:border-[#6AC387]/30 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        {/* Deliverable type is the primary scan target — show it
                            bold/large. Link-type label is secondary context. */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">
                            {link.deliverableType}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {LINK_LABELS[link.variableName ?? ""] ?? link.label}
                          </span>
                          {link.count > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              Sent {link.count}x
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground truncate block mt-0.5">
                          {link.url}
                        </span>
                      </div>
                      <ExternalLink className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Delivery History */}
          {deliveries.length > 0 ? (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Delivery History
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dept</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Links</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((delivery) => {
                      const senderLookup = memberByEmail.get(
                        delivery.sentBy?.toLowerCase() ?? ""
                      );
                      return (
                      <TableRow key={delivery.id}>
                        <TableCell className="whitespace-nowrap pl-4">
                          <div className="text-sm">
                            {formatDate(delivery.sentAt)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatTime(delivery.sentAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Avatar
                            src={senderLookup?.profilePicture}
                            name={senderLookup?.username ?? delivery.sentBy}
                            size={22}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {delivery.deliverableType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DepartmentBadge department={delivery.department} />
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {delivery.emailSubject}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {delivery.primaryEmail || (delivery.slackChannel ? `#${delivery.slackChannelName || "slack"}` : "—")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {delivery.links.map((link) => (
                              <a
                                key={link.id}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-muted/80"
                                title={link.url}
                              >
                                <ExternalLink className="h-3 w-3" />
                                {LINK_LABELS[link.variableName ?? ""] ??
                                  link.label}
                              </a>
                            ))}
                            {delivery.links.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No deliveries have been sent for this project yet.
            </div>
          )}
        </>
      )}
    </div>
  );
}
