"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import PacmanLoader from "@/components/ui/pacman-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileEdit } from "lucide-react";

interface Draft {
  id: string;
  taskId: string;
  formData: {
    deliverableType?: string;
    clientName?: string;
    projectName?: string;
    taskName?: string;
    deliverableName?: string;
  };
  savedBy: string;
  savedAt: string;
  updatedAt: string;
}

interface WorkspaceMember {
  username: string;
  email: string;
  profilePicture?: string;
  initials: string;
}

/** Turn a savedBy value (usually an email) into a display name. */
function savedByName(savedBy: string): string {
  if (!savedBy?.includes("@")) return savedBy;
  return savedBy
    .split("@")[0]
    .split(".")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function DraftsTable() {
  const router = useRouter();

  const { data, isLoading, error } = useQuery<{ drafts: Draft[] }>({
    queryKey: ["drafts"],
    queryFn: async () => {
      const res = await fetch("/api/drafts");
      if (!res.ok) throw new Error("Failed to fetch drafts");
      return res.json();
    },
  });

  // Workspace members give us each saved-by user's real avatar, keyed by email.
  const { data: membersData } = useQuery<{ members: WorkspaceMember[] }>({
    queryKey: ["workspace-members"],
    queryFn: async () => {
      const res = await fetch("/api/settings/workspace-members");
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  const membersByEmail = new Map(
    (membersData?.members ?? []).map((m) => [m.email.toLowerCase(), m])
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <PacmanLoader size={72} />
        <span className="font-pixel text-[13px]" style={{ color: "#6AC387" }}>LOADING DRAFTS</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Unable to load drafts. Database may not be connected yet.
      </div>
    );
  }

  const drafts = data?.drafts ?? [];

  if (drafts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No drafts yet. Save a delivery form to see drafts here.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task Name</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Deliverable Type</TableHead>
            <TableHead>Saved By</TableHead>
            <TableHead>Last Saved</TableHead>
            <TableHead className="w-[100px]">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drafts.map((draft) => (
            <TableRow key={draft.id}>
              <TableCell className="text-sm font-medium">
                {(draft.formData as Record<string, string>)?.taskName || draft.taskId}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {(draft.formData as Record<string, string>)?.clientName && (draft.formData as Record<string, string>)?.projectName
                  ? `${(draft.formData as Record<string, string>).clientName} — ${(draft.formData as Record<string, string>).projectName}`
                  : (draft.formData as Record<string, string>)?.projectName || "—"}
              </TableCell>
              <TableCell>
                {(draft.formData as Record<string, string>)?.deliverableType || "—"}
              </TableCell>
              <TableCell className="text-sm">
                {(() => {
                  const member = draft.savedBy
                    ? membersByEmail.get(draft.savedBy.toLowerCase())
                    : undefined;
                  const name = savedByName(draft.savedBy);
                  const initials =
                    member?.initials ||
                    name
                      .split(/\s+/)
                      .map((p) => p.charAt(0))
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                  return (
                    <span className="flex items-center gap-2">
                      {member?.profilePicture ? (
                        <img
                          src={member.profilePicture}
                          alt=""
                          className="h-6 w-6 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                          {initials}
                        </span>
                      )}
                      {name}
                    </span>
                  );
                })()}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatRelativeTime(draft.updatedAt)}
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/deliverable/${draft.taskId}`)}
                >
                  <FileEdit className="mr-1 h-3 w-3" />
                  Resume
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
