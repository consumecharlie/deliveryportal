"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
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
  Loader2,
  Link as LinkIcon,
  Send,
} from "lucide-react";
import { DepartmentBadge } from "@/components/dashboard/department-badge";

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
          <h1 className="text-xl font-bold">Project Deliveries</h1>
          <p className="text-sm text-muted-foreground">
            All deliveries and links sent for this project.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading project data...
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
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {LINK_LABELS[link.variableName ?? ""] ??
                              link.label}
                          </span>
                          {link.count > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              Sent {link.count}x
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {link.deliverableType}
                          </Badge>
                        </div>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary hover:underline truncate block mt-0.5"
                        >
                          {link.url}
                        </a>
                      </div>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
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
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Links</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="text-sm">
                            {formatDate(delivery.sentAt)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatTime(delivery.sentAt)}
                          </div>
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
                          {delivery.primaryEmail}
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
                    ))}
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
