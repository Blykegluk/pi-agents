"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Coins, Activity, AlertTriangle } from "lucide-react";
import type { OverviewStats } from "@/lib/types";

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

export function KpiCards({ stats }: { stats: OverviewStats }) {
  const cards = [
    {
      title: "Total Cost",
      value: formatCost(stats.totalCost),
      icon: DollarSign,
      color: "text-green-500",
    },
    {
      title: "Total Tokens",
      value: formatTokens(stats.totalTokens),
      icon: Coins,
      color: "text-blue-500",
    },
    {
      title: "Sessions",
      value: stats.sessionCount.toString(),
      icon: Activity,
      color: "text-purple-500",
    },
    {
      title: "Error Rate",
      value: `${(stats.errorRate * 100).toFixed(1)}%`,
      icon: AlertTriangle,
      color: stats.errorRate > 0.1 ? "text-red-500" : "text-yellow-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
