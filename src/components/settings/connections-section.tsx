"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Link2Off, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ProviderStatus {
  provider: "google" | "slack";
  configured: boolean;
  state: "connected" | "needs_reconnect" | "not_connected";
  canSend: boolean;
  lastError: string | null;
  externalLabel: string | null;
}

const META = {
  google: {
    label: "Google",
    icon: Mail,
    blurb: "Lets the portal create delivery drafts in your Gmail, and send them when you choose to.",
  },
  slack: {
    label: "Slack",
    icon: MessageSquare,
    blurb: "Lets the portal post deliveries to client channels as you, rather than as a bot.",
  },
} as const;

export function ConnectionsSection() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const { data, isLoading } = useQuery<{ userEmail: string; providers: ProviderStatus[] }>({
    queryKey: ["connections"],
    queryFn: async () => {
      const res = await fetch("/api/connections");
      if (!res.ok) throw new Error("Failed to load connections");
      return res.json();
    },
  });

  // The OAuth callback redirects back here with the outcome.
  const result = searchParams.get("connection");
  const detail = searchParams.get("detail");
  useEffect(() => {
    if (!result) return;
    if (result === "connected") toast.success("Account connected");
    else if (result === "denied") toast.message("Connection cancelled");
    else toast.error(detail || "Could not complete the connection");
    // Clear the params so a refresh does not re-toast.
    window.history.replaceState({}, "", "/settings");
    queryClient.invalidateQueries({ queryKey: ["connections"] });
  }, [result, detail, queryClient]);

  const disconnect = useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/connections/${provider}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => {
      toast.success("Disconnected");
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: () => toast.error("Failed to disconnect"),
  });

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="font-eighties text-lg">My Connections</h2>
        <p className="text-sm text-muted-foreground">
          Deliveries are drafted and posted using your own accounts. If a connection stops
          working you can reconnect it here yourself.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-3">
          {data?.providers.map((p) => {
            const meta = META[p.provider];
            const Icon = meta.icon;
            return (
              <div
                key={p.provider}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4"
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {meta.label}
                      {p.state === "connected" && (
                        <span className="flex items-center gap-1 text-xs font-normal text-[#6AC387]">
                          <CheckCircle2 className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                      {p.state === "needs_reconnect" && (
                        <span className="flex items-center gap-1 text-xs font-normal text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          Needs reconnecting
                        </span>
                      )}
                      {p.state === "not_connected" && (
                        <span className="text-xs font-normal text-muted-foreground">
                          Not connected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{meta.blurb}</p>
                    {p.lastError && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">{p.lastError}</p>
                    )}
                    {!p.configured && (
                      <p className="text-xs text-muted-foreground">
                        Not configured on this deployment yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {p.state !== "not_connected" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => disconnect.mutate(p.provider)}
                      disabled={disconnect.isPending}
                    >
                      <Link2Off className="mr-1 h-3 w-3" />
                      Disconnect
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={!p.configured}
                    onClick={() => {
                      window.location.href = `/api/connections/${p.provider}/start`;
                    }}
                  >
                    {p.state === "connected" ? "Reconnect" : "Connect"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
