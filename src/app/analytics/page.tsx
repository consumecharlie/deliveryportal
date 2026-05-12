"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PacmanLoader from "@/components/ui/pacman-loader";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DepartmentBadge, getDepartmentChartColor } from "@/components/dashboard/department-badge";
import { Avatar } from "@/components/dashboard/assignee-filter";
import {
  Send,
  Users,
  Folder,
  FileText,
  Pencil,
  MessageSquare,
  Loader2,
} from "lucide-react";

interface AnalyticsData {
  totalDeliveries: number;
  editedCount: number;
  slackCount: number;
  uniqueClients: number;
  uniqueProjects: number;
  deliveriesOverTime: Array<{ week: string; count: number }>;
  byDepartment: Array<{ department: string; count: number }>;
  byType: Array<{ deliverableType: string; count: number }>;
  teamLeaderboard: Array<{ senderEmail: string; count: number }>;
  recentActivity: Array<{
    id: string;
    deliverableType: string;
    department: string;
    clientName: string;
    projectName: string;
    sentBy: string;
    sentAt: string;
  }>;
  period: string;
}

const CHART_COLORS = [
  "hsl(221, 83%, 53%)", // blue
  "hsl(142, 71%, 45%)", // green
  "hsl(38, 92%, 50%)",  // amber
  "hsl(0, 84%, 60%)",   // red
  "hsl(262, 83%, 58%)", // purple
  "hsl(173, 80%, 40%)", // teal
  "hsl(339, 82%, 51%)", // pink
  "hsl(25, 95%, 53%)",  // orange
];

function formatWeekLabel(week: string): string {
  const date = new Date(week + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSenderName(email: string): string {
  if (!email) return "Unknown";
  // Try to extract a readable name from the email
  const local = email.split("@")[0];
  return local
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("90d");

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["analytics", period],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  // Fetch ClickUp workspace members so we can resolve sender emails to
  // profile pictures in the Recent Activity feed and Team Leaderboard.
  const { data: membersData } = useQuery<{
    members: Array<{
      id: number;
      username: string;
      email: string;
      profilePicture?: string;
      initials: string;
    }>;
  }>({
    queryKey: ["settings", "workspace-members"],
    queryFn: async () => {
      const res = await fetch("/api/settings/workspace-members");
      if (!res.ok) throw new Error("Failed to fetch workspace members");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // email → profile picture lookup (lowercased for case-insensitive match
  // against the senderEmail values stored on Delivery rows).
  const memberByEmail = new Map<
    string,
    { profilePicture?: string; username: string }
  >();
  for (const m of membersData?.members ?? []) {
    if (m.email) {
      memberByEmail.set(m.email.toLowerCase(), {
        profilePicture: m.profilePicture,
        username: m.username,
      });
    }
  }

  const periodLabel =
    period === "30d"
      ? "Last 30 Days"
      : period === "90d"
        ? "Last 90 Days"
        : period === "12m"
          ? "Last 12 Months"
          : "All Time";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-eighties text-2xl">Analytics</h1>
          <p className="text-muted-foreground">
            Delivery performance and team activity.
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 90 Days</SelectItem>
            <SelectItem value="12m">Last 12 Months</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <PacmanLoader size={32} />
          <span className="font-pixel text-[13px]" style={{ color: "#6AC387" }}>LOADING ANALYTICS</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-12 text-destructive">
          Failed to load analytics. The database may not be connected.
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">
                      {data.totalDeliveries}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total Deliveries
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">
                      {data.uniqueClients}
                    </p>
                    <p className="text-xs text-muted-foreground">Clients</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">
                      {data.uniqueProjects}
                    </p>
                    <p className="text-xs text-muted-foreground">Projects</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{data.editedCount}</p>
                    <p className="text-xs text-muted-foreground">
                      Custom Edited
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{data.slackCount}</p>
                    <p className="text-xs text-muted-foreground">
                      Sent to Slack
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Deliveries over time */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">
                Deliveries Over Time — {periodLabel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.deliveriesOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data.deliveriesOverTime}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis
                      dataKey="week"
                      tickFormatter={formatWeekLabel}
                      className="text-xs"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      className="text-xs"
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      labelFormatter={(label) =>
                        `Week of ${formatWeekLabel(label as string)}`
                      }
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--popover))",
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Deliveries"
                      stroke="hsl(221, 83%, 53%)"
                      fill="hsl(221, 83%, 53%)"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  No delivery data for this period.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Department + Type charts row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* By Department (pie) */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">By Department</CardTitle>
              </CardHeader>
              <CardContent>
                {data.byDepartment.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={220}>
                      <PieChart>
                        <Pie
                          data={data.byDepartment}
                          dataKey="count"
                          nameKey="department"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          innerRadius={50}
                        >
                          {data.byDepartment.map((entry, index) => (
                            <Cell
                              key={`dept-${index}`}
                              fill={getDepartmentChartColor(entry.department)}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          // Custom content avoids Recharts' default inline-styled
                          // tooltip, which was rendering as black text with no
                          // background on the dark theme.
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0];
                            const dept = String(p.name ?? "Unknown");
                            const count = Number(p.value ?? 0);
                            return (
                              <div className="inline-flex items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor:
                                      getDepartmentChartColor(dept),
                                  }}
                                />
                                <span className="font-medium">{dept}</span>
                                <span className="text-muted-foreground">
                                  {count}
                                </span>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Stat bars mirror the Top Deliverable Types pattern but
                        colored per department. */}
                    <div className="flex-1 space-y-2.5">
                      {(() => {
                        const max =
                          data.byDepartment[0]?.count ??
                          Math.max(...data.byDepartment.map((d) => d.count));
                        return data.byDepartment.map((dept) => {
                          const widthPct = Math.max(
                            (dept.count / (max || 1)) * 100,
                            2
                          );
                          const color = getDepartmentChartColor(dept.department);
                          return (
                            <div
                              key={dept.department}
                              className="flex items-center gap-3"
                            >
                              <div
                                className="w-32 shrink-0 truncate text-xs text-muted-foreground text-right"
                                title={dept.department}
                              >
                                {dept.department || "Unknown"}
                              </div>
                              <div className="flex-1 bg-muted/30 rounded-full h-6 overflow-hidden">
                                <div
                                  className="h-full rounded-full flex items-center px-2.5 transition-[width] duration-500"
                                  style={{
                                    width: `${widthPct}%`,
                                    backgroundColor: color,
                                    minWidth: "2rem",
                                  }}
                                >
                                  <span className="text-xs font-semibold text-white">
                                    {dept.count}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                    No data.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Deliverable Type (bar) */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">
                  Top Deliverable Types
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.byType.length > 0 ? (
                  // Hand-rolled horizontal bar list — mimics the
                  // "Department Breakdown" pattern from consume-media-insights:
                  // fixed-width label on the left, rounded-pill track with the
                  // count rendered INSIDE the filled bar. No tooltip; value
                  // is always visible. The minWidth on the bar guarantees
                  // even single-digit counts have room to sit inside.
                  <div className="space-y-2.5 py-1">
                    {(() => {
                      const rows = data.byType.slice(0, 8);
                      const max = rows[0]?.count ?? 1;
                      return rows.map((row) => {
                        const widthPct = Math.max((row.count / max) * 100, 2);
                        return (
                          <div
                            key={row.deliverableType}
                            className="flex items-center gap-3"
                          >
                            <div
                              className="w-40 shrink-0 truncate text-xs text-muted-foreground text-right"
                              title={row.deliverableType}
                            >
                              {row.deliverableType}
                            </div>
                            <div className="flex-1 bg-muted/30 rounded-full h-6 overflow-hidden">
                              <div
                                className="h-full rounded-full flex items-center px-2.5 transition-[width] duration-500"
                                style={{
                                  width: `${widthPct}%`,
                                  backgroundColor: "#6AC387",
                                  minWidth: "2rem",
                                }}
                              >
                                <span className="text-xs font-semibold text-[#151919]">
                                  {row.count}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                    No data.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Leaderboard + Activity Feed row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Team Leaderboard */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Team Leaderboard</CardTitle>
              </CardHeader>
              <CardContent>
                {data.teamLeaderboard.length > 0 ? (
                  <div className="space-y-3">
                    {data.teamLeaderboard.map((member, i) => {
                      const maxCount = data.teamLeaderboard[0]?.count ?? 1;
                      const pct = Math.round((member.count / maxCount) * 100);
                      const displayName = formatSenderName(member.senderEmail);
                      const profile = memberByEmail.get(
                        member.senderEmail.toLowerCase()
                      );
                      return (
                        <div key={member.senderEmail} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs text-muted-foreground w-5 shrink-0">
                                {i + 1}.
                              </span>
                              <Avatar
                                src={profile?.profilePicture}
                                name={displayName}
                                size={24}
                              />
                              <span className="font-medium truncate">
                                {displayName}
                              </span>
                            </div>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {member.count}{" "}
                              {member.count === 1
                                ? "delivery"
                                : "deliveries"}
                            </Badge>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor:
                                  CHART_COLORS[i % CHART_COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                    No data.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity Feed */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentActivity.length > 0 ? (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {data.recentActivity.map((item) => {
                      const senderDisplayName = formatSenderName(item.sentBy);
                      const member = memberByEmail.get(item.sentBy.toLowerCase());
                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 text-sm"
                        >
                          <div className="mt-0.5 shrink-0">
                            <Avatar
                              src={member?.profilePicture}
                              name={senderDisplayName}
                              size={28}
                            />
                          </div>
                          <div className="mt-0.5 shrink-0">
                            <DepartmentBadge department={item.department} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p>
                              <span className="font-medium">
                                {senderDisplayName}
                              </span>{" "}
                              sent{" "}
                              <span className="text-muted-foreground">
                                {item.deliverableType}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.clientName}
                              {item.projectName
                                ? ` / ${item.projectName}`
                                : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                            {formatRelativeTime(item.sentAt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                    No recent activity.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
