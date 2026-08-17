"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, GitBranch, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deriveVersionName } from "@/lib/template-version";

const LABELS = ["V2", "V3", "Final"] as const;

export function NewVersionDialog({
  open, onOpenChange, sourceName, snippet, subjectLine, department, existingTypeNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  snippet: string;
  subjectLine: string;
  department: string;
  existingTypeNames: string[];
}) {
  const router = useRouter();
  const [targetName, setTargetName] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (open) { setCustom(""); setTargetName(deriveVersionName(sourceName, "V2")); }
  }, [open, sourceName]);

  const typeExists = existingTypeNames.some(
    (n) => n.trim().toLowerCase() === targetName.trim().toLowerCase()
  );

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/templates/version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippet, subjectLine, department, deliverableType: targetName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || "Failed"), { data });
      return data as { taskId: string; typeExists: boolean };
    },
    onSuccess: (data) => {
      onOpenChange(false);
      toast.success("Version created", {
        description: data.typeExists
          ? "Content copied and tagged to the deliverable type."
          : "Content copied. One quick step left: add the new type in ClickUp.",
      });
      router.push(`/templates/${data.taskId}${data.typeExists ? "" : "?newType=1"}`);
    },
    onError: (err: Error & { data?: { existingTaskId?: string } }) => {
      const existingTaskId = err.data?.existingTaskId;
      toast.error(err.message, existingTaskId ? {
        action: { label: "Open existing", onClick: () => router.push(`/templates/${existingTaskId}`) },
      } : undefined);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Duplicate as Version
          </DialogTitle>
          <DialogDescription>
            Create a new template from “{sourceName}”. Pick a version, confirm the name, and it’s copied for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {LABELS.map((l) => (
              <Button
                key={l}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setCustom(""); setTargetName(deriveVersionName(sourceName, l)); }}
              >
                {l}
              </Button>
            ))}
            <Input
              value={custom}
              placeholder="Other…"
              className="h-8 w-24"
              onChange={(e) => {
                setCustom(e.target.value);
                if (e.target.value.trim()) setTargetName(deriveVersionName(sourceName, e.target.value.trim()));
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Target deliverable type</Label>
            <Input value={targetName} onChange={(e) => setTargetName(e.target.value)} />
            <p className={cn("flex items-center gap-1.5 text-xs",
              typeExists ? "text-muted-foreground" : "text-amber-600")}>
              {typeExists
                ? (<><Check className="h-3 w-3" /> Type exists — the template will be tagged to it.</>)
                : (<><AlertTriangle className="h-3 w-3" /> New type — you’ll add it in ClickUp in one guided step after.</>)}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || targetName.trim() === "" ||
              targetName.trim().toLowerCase() === sourceName.trim().toLowerCase()}
          >
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
            Create version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
