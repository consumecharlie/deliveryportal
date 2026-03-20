"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { DepartmentBadge } from "@/components/dashboard/department-badge";
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
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading analytics...
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
                          {data.byDepartment.map((_, index) => (
                            <Cell
                              key={`dept-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: "8px",
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--popover))",
                            color: "hsl(var(--popover-foreground))",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {data.byDepartment.map((dept, i) => (
                        <div
                          key={dept.department}
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{
                                backgroundColor:
                                  CHART_COLORS[i % CHART_COLORS.length],
                              }}
                            />
                            <span>{dept.department || "Unknown"}</span>
                          </div>
                          <span className="font-medium">{dept.count}</span>
                        </div>
                      ))}
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
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={data.byType.slice(0, 8)}
                      layout="vertical"
                      margin={{ left: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="deliverableType"
                        width={140}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid hsl(var(--border))",
                          background: "hsl(var(--popover))",
                          color: "hsl(var(--popover-foreground))",
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Deliveries"
                        fill="hsl(142, 71%, 45%)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
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
                      return (
                        <div key={member.senderEmail} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground w-5">
                                {i + 1}.
                              </span>
                              <span className="font-medium">
                                {formatSenderName(member.senderEmail)}
                              </span>
                            </div>
                            <Badge variant="secondary" className="text-xs">
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
                    {data.recentActivity.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 text-sm"
                      >
                        <div className="mt-0.5 shrink-0">
                          <DepartmentBadge department={item.department} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p>
                            <span className="font-medium">
                              {formatSenderName(item.sentBy)}
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
                    ))}
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
