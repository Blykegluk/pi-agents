"use client";

import { KpiCards } from "@/components/dashboard/kpi-cards";
import { CostTrendChart } from "@/components/dashboard/cost-trend-chart";
import { RecentSessions } from "@/components/dashboard/recent-sessions";
import { usePolling } from "@/hooks/use-polling";
import type { OverviewStats, SessionSummary } from "@/lib/types";

export default function OverviewPage() {
  const { data: stats, isLoading: statsLoading } =
    usePolling<OverviewStats>("/api/stats");
  const { data: sessionsData, isLoading: sessionsLoading } =
    usePolling<{ sessions: SessionSummary[]; total: number }>("/api/sessions?limit=5");

  if (statsLoading || sessionsLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Overview</h2>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Overview</h2>
      {stats && <KpiCards stats={stats} />}
      {stats && <CostTrendChart data={stats.costByDay} />}
      {sessionsData && <RecentSessions sessions={sessionsData.sessions} />}
    </div>
  );
}
