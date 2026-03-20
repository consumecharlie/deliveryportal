"use client";

import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DepartmentBadge } from "./department-badge";
import { ExternalLink, Eye } from "lucide-react";

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
  emailSubject: string;
  emailContent: string;
  slackContent: string | null;
  wasEdited: boolean;
  sentBy: string;
  sentAt: string;
  n8nStatus: string | null;
  links: DeliveryLink[];
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <PacmanLoader size={32} />
        <span className="font-pixel text-[13px]" style={{ color: "#6AC387" }}>LOADING SENT</span>
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

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Deliverable Type</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Sent By</TableHead>
              <TableHead>Sent At</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Slack</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]">View</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => (
              <TableRow key={delivery.id}>
                <TableCell className="font-medium">
                  {delivery.clientName || "—"}
                </TableCell>
                <TableCell>{delivery.projectName || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {delivery.deliverableType || "—"}
                </TableCell>
                <TableCell>
                  <DepartmentBadge department={delivery.department} />
                </TableCell>
                <TableCell className="text-sm">{delivery.sentBy}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(delivery.sentAt)}
                </TableCell>
                <TableCell className="text-sm">
                  {delivery.primaryEmail}
                </TableCell>
                <TableCell>
                  {delivery.slackChannel ? (
                    <Badge variant="outline" className="text-xs">
                      #{delivery.slackChannel}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      delivery.n8nStatus === "success"
                        ? "default"
                        : delivery.n8nStatus === "error"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {delivery.n8nStatus ?? "sent"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDelivery(delivery)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delivery detail dialog */}
      <Dialog
        open={!!selectedDelivery}
        onOpenChange={(open) => !open && setSelectedDelivery(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delivery Details</DialogTitle>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="font-medium">To:</span>{" "}
                  {selectedDelivery.primaryEmail}
                </div>
                {selectedDelivery.ccEmails && (
                  <div>
                    <span className="font-medium">CC:</span>{" "}
                    {selectedDelivery.ccEmails}
                  </div>
                )}
                <div>
                  <span className="font-medium">From:</span>{" "}
                  {selectedDelivery.senderEmail}
                </div>
                <div>
                  <span className="font-medium">Sent:</span>{" "}
                  {formatDate(selectedDelivery.sentAt)}
                </div>
                {selectedDelivery.slackChannel && (
                  <div>
                    <span className="font-medium">Slack:</span> #
                    {selectedDelivery.slackChannel}
                  </div>
                )}
                {selectedDelivery.wasEdited && (
                  <div>
                    <Badge variant="outline">Manually edited</Badge>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">
                  Subject: {selectedDelivery.emailSubject}
                </h4>
                <div className="rounded border p-4 bg-muted/30 text-sm whitespace-pre-wrap">
                  {selectedDelivery.emailContent}
                </div>
              </div>

              {selectedDelivery.links.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Links Included</h4>
                  <div className="space-y-1">
                    {selectedDelivery.links.map((link) => (
                      <div key={link.id} className="flex items-center gap-2 text-sm">
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {link.label}:
                        </span>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline truncate max-w-[300px]"
                        >
                          {link.url}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
