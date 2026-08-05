"use client";

import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Hash,
  Loader2,
  UserPlus,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GREEN = "#6AC387";

type Step = "channel" | "people" | "apply";
type Role = "Primary" | "Standard" | "Log";

interface ChannelCandidate {
  id: string;
  name: string;
  isMember: boolean;
  isPrivate: boolean;
  score: number;
}

interface SuggestResponse {
  candidates: ChannelCandidate[];
  currentChannelId: string | null;
}

interface CreatePlanItem {
  name: string;
  email?: string;
  userId: string;
}

interface UpdatePlanItem {
  taskId: string;
  name: string;
  email?: string;
  userId?: string;
}

interface AmbiguousPlanItem {
  userId: string;
  name: string;
  email?: string;
}

interface PeopleResponse {
  people: Array<{
    userId: string;
    name: string;
    email?: string;
    isExternal: boolean;
  }>;
  plan: {
    create: CreatePlanItem[];
    update: UpdatePlanItem[];
    ambiguous: AmbiguousPlanItem[];
  };
}

interface ApplyResult {
  item: string;
  ok: boolean;
  error?: string;
}

interface ApplyResponse {
  results: ApplyResult[];
}

export function ConfigureWizard({
  listId,
  clientName,
  projectName,
  open,
  onOpenChange,
}: {
  listId: string;
  clientName: string;
  projectName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}): JSX.Element {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("channel");
  const [channelFilter, setChannelFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<{
    id: string;
    isMember: boolean;
  } | null>(null);

  // People selection state
  const [createChecked, setCreateChecked] = useState<Record<string, boolean>>({});
  const [createRoles, setCreateRoles] = useState<Record<string, Role>>({});
  const [updateChecked, setUpdateChecked] = useState<Record<string, boolean>>({});

  // Reset to first step whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setStep("channel");
      setChannelFilter("");
      setSelectedId(null);
      setSelectedChannel(null);
      setCreateChecked({});
      setCreateRoles({});
      setUpdateChecked({});
    }
  }, [open]);

  // --- Step 1: channel suggestions -------------------------------------
  const suggestQuery = useQuery<SuggestResponse>({
    queryKey: ["setup-suggest", listId],
    queryFn: () =>
      fetch(`/api/setup/channels/suggest?listId=${encodeURIComponent(listId)}`).then(
        (r) => r.json()
      ),
    enabled: open && step === "channel",
  });

  const candidates = suggestQuery.data?.candidates ?? [];
  const currentChannelId = suggestQuery.data?.currentChannelId ?? null;

  // Pre-select currentChannelId (else first candidate) once data arrives.
  useEffect(() => {
    if (step !== "channel" || candidates.length === 0) return;
    if (selectedId && candidates.some((c) => c.id === selectedId)) return;
    const preferred =
      (currentChannelId && candidates.some((c) => c.id === currentChannelId)
        ? currentChannelId
        : null) ?? candidates[0]?.id ?? null;
    setSelectedId(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, currentChannelId, step]);

  const filteredCandidates = useMemo(() => {
    const q = channelFilter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(q));
  }, [candidates, channelFilter]);

  // --- Step 2: channel people ------------------------------------------
  const peopleQuery = useQuery<PeopleResponse>({
    queryKey: ["setup-people", selectedChannel?.id ?? "", listId],
    queryFn: () =>
      fetch(
        `/api/setup/channel-people?channelId=${encodeURIComponent(
          selectedChannel?.id ?? ""
        )}&listId=${encodeURIComponent(listId)}`
      ).then((r) => r.json()),
    enabled: open && step === "people" && !!selectedChannel?.id,
  });

  const plan = peopleQuery.data?.plan;

  // Initialise checkbox + role defaults when the plan arrives.
  useEffect(() => {
    if (!plan) return;
    setCreateChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const c of plan.create) next[c.userId] = prev[c.userId] ?? true;
      return next;
    });
    setCreateRoles((prev) => {
      const next: Record<string, Role> = {};
      for (const c of plan.create) next[c.userId] = prev[c.userId] ?? "Standard";
      return next;
    });
    setUpdateChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const u of plan.update) next[u.taskId] = prev[u.taskId] ?? true;
      return next;
    });
  }, [plan]);

  // --- Step 3: apply ----------------------------------------------------
  const applyMutation = useMutation<ApplyResponse>({
    mutationFn: async () => {
      if (!selectedChannel) throw new Error("No channel selected");
      const contacts = [
        ...(plan?.create ?? [])
          .filter((c) => createChecked[c.userId])
          .map((c) => ({
            action: "create" as const,
            name: c.name,
            email: c.email,
            userId: c.userId,
            role: createRoles[c.userId] ?? "Standard",
          })),
        ...(plan?.update ?? [])
          .filter((u) => updateChecked[u.taskId])
          .map((u) => ({
            action: "update" as const,
            taskId: u.taskId,
            name: u.name,
            email: u.email,
            userId: u.userId,
          })),
      ];
      const res = await fetch("/api/setup/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId,
          channelId: selectedChannel.id,
          join: !selectedChannel.isMember,
          contacts,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to apply setup");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const results = data.results ?? [];
      const failed = results.filter((r) => !r.ok);
      const okCount = results.length - failed.length;
      if (failed.length > 0) {
        toast.error(
          `Applied ${okCount}/${results.length}. Failed: ${failed
            .map((f) => f.item)
            .join(", ")}`
        );
      } else {
        toast.success(`Setup applied — ${okCount} change${okCount === 1 ? "" : "s"}.`);
      }
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to apply setup");
    },
  });

  const selectedCandidate = candidates.find((c) => c.id === selectedId) ?? null;

  const createCount = (plan?.create ?? []).filter((c) => createChecked[c.userId]).length;
  const updateCount = (plan?.update ?? []).filter((u) => updateChecked[u.taskId]).length;
  const selectedChannelName =
    candidates.find((c) => c.id === selectedChannel?.id)?.name ?? selectedChannel?.id ?? "";

  function goToPeople() {
    if (!selectedCandidate) return;
    setSelectedChannel({ id: selectedCandidate.id, isMember: selectedCandidate.isMember });
    setStep("people");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && applyMutation.isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure from channel</DialogTitle>
          <DialogDescription>
            {clientName} · {projectName}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {(["channel", "people", "apply"] as Step[]).map((s, i) => {
            const active = s === step;
            const label = s === "channel" ? "Channel" : s === "people" ? "People" : "Review";
            return (
              <span key={s} className="flex items-center gap-2">
                <span
                  className={
                    active
                      ? "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                      : "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 opacity-60"
                  }
                  style={active ? { background: `${GREEN}26`, color: GREEN } : undefined}
                >
                  {i + 1}. {label}
                </span>
                {i < 2 ? <span className="opacity-40">→</span> : null}
              </span>
            );
          })}
        </div>

        {/* --- STEP 1: CHANNEL --- */}
        {step === "channel" && (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="channel-filter">Slack channel</Label>
              <Input
                id="channel-filter"
                type="text"
                placeholder="Filter channels…"
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
              />
            </div>

            {suggestQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-border px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Finding candidate channels…
              </div>
            ) : suggestQuery.isError ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-4 text-sm text-red-400">
                Failed to load channel suggestions.
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                No matching channels.
              </div>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {filteredCandidates.map((c) => {
                  const checked = selectedId === c.id;
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition ${
                        checked
                          ? "border-[#6AC387]/60 bg-[#6AC387]/10"
                          : "border-border hover:border-foreground/20"
                      }`}
                    >
                      <input
                        type="radio"
                        name="setup-channel"
                        className="h-4 w-4 accent-[#6AC387]"
                        checked={checked}
                        onChange={() => setSelectedId(c.id)}
                      />
                      <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {c.name}
                        {c.id === currentChannelId ? (
                          <span className="ml-2 text-xs text-[#6AC387]">current</span>
                        ) : null}
                      </span>
                      {!c.isMember ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          not joined
                        </span>
                      ) : null}
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
                        {Math.round(c.score)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <DialogFooter>
              <Button
                className="bg-[#6AC387] text-[#151919] hover:bg-[#5aad74]"
                disabled={!selectedCandidate}
                onClick={goToPeople}
              >
                Next: people
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* --- STEP 2: PEOPLE --- */}
        {step === "people" && (
          <div className="space-y-4 py-1">
            {peopleQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-border px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading channel members…
              </div>
            ) : peopleQuery.isError ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-4 text-sm text-red-400">
                Failed to load channel people.
              </div>
            ) : (
              <>
                {/* New contacts */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <UserPlus className="h-3.5 w-3.5" /> New contacts
                  </div>
                  {(plan?.create ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">None to create.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(plan?.create ?? []).map((c) => (
                        <div
                          key={c.userId}
                          className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input accent-[#6AC387]"
                            checked={createChecked[c.userId] ?? true}
                            onChange={(e) =>
                              setCreateChecked((prev) => ({
                                ...prev,
                                [c.userId]: e.target.checked,
                              }))
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-foreground">{c.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {c.email ? `${c.email} · ` : ""}
                              {c.userId}
                            </div>
                          </div>
                          <select
                            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={createRoles[c.userId] ?? "Standard"}
                            onChange={(e) =>
                              setCreateRoles((prev) => ({
                                ...prev,
                                [c.userId]: e.target.value as Role,
                              }))
                            }
                          >
                            <option value="Primary">Primary</option>
                            <option value="Standard">Standard</option>
                            <option value="Log">Log</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Update existing */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <UserCog className="h-3.5 w-3.5" /> Update existing
                  </div>
                  {(plan?.update ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">None to update.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(plan?.update ?? []).map((u) => {
                        const fills: string[] = [];
                        if (u.email) fills.push(`email ${u.email}`);
                        if (u.userId) fills.push(`Slack ID ${u.userId}`);
                        return (
                          <div
                            key={u.taskId}
                            className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-input accent-[#6AC387]"
                              checked={updateChecked[u.taskId] ?? true}
                              onChange={(e) =>
                                setUpdateChecked((prev) => ({
                                  ...prev,
                                  [u.taskId]: e.target.checked,
                                }))
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-foreground">{u.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {fills.length > 0 ? `Will fill ${fills.join(" · ")}` : "No changes"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Ambiguous */}
                {(plan?.ambiguous ?? []).length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-[#DBEF00]" /> Needs manual
                      attention
                    </div>
                    <div className="space-y-1.5">
                      {(plan?.ambiguous ?? []).map((a) => (
                        <div
                          key={a.userId}
                          className="rounded-md border border-[#DBEF00]/30 bg-[#DBEF00]/5 px-3 py-2"
                        >
                          <div className="truncate text-sm text-foreground">{a.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            matched more than one contact — fix in ClickUp
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <DialogFooter className="sm:justify-between">
              <Button variant="outline" onClick={() => setStep("channel")}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                className="bg-[#6AC387] text-[#151919] hover:bg-[#5aad74]"
                disabled={peopleQuery.isLoading || peopleQuery.isError}
                onClick={() => setStep("apply")}
              >
                Next: review
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* --- STEP 3: APPLY --- */}
        {step === "apply" && (
          <div className="space-y-4 py-1">
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
              Set channel{" "}
              <span className="font-medium text-[#6AC387]">#{selectedChannelName}</span>
              {selectedChannel && !selectedChannel.isMember ? " + join bot" : ""} · create{" "}
              {createCount} · update {updateCount}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setStep("people")}
                disabled={applyMutation.isPending}
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                className="bg-[#6AC387] text-[#151919] hover:bg-[#5aad74]"
                disabled={applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
              >
                {applyMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Applying…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Apply
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
