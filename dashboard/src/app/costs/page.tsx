"use client";

import { usePolling } from "@/hooks/use-polling";
import type { CostBreakdown } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_COLORS, MODEL_COLORS } from "@/lib/constants";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fmtCost = (v: any) => `$${Number(v ?? 0).toFixed(4)}`;
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from "recharts";

export default function CostsPage() {
  const { data, isLoading } = usePolling<CostBreakdown>("/api/costs");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Costs</h2>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!data) return null;

  const avgDaily =
    data.byDay.length > 0 ? data.totalCost / data.byDay.length : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Costs</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.totalCost.toFixed(4)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Avg Daily
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${avgDaily.toFixed(4)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Cache Savings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              ${data.cacheSavings.toFixed(4)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost by Model */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cost by Model</CardTitle>
          </CardHeader>
          <CardContent>
            {data.byModel.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.byModel}
                    dataKey="cost"
                    nameKey="model"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(props) => {
                      const name = String((props as { name?: string }).name ?? "");
                      const value = Number((props as { value?: number }).value ?? 0);
                      return `${name.replace("claude-", "")} $${value.toFixed(3)}`;
                    }}
                  >
                    {data.byModel.map((entry) => (
                      <Cell
                        key={entry.model}
                        fill={MODEL_COLORS[entry.model] || "#888"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={fmtCost}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Cost by Agent */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cost by Agent</CardTitle>
          </CardHeader>
          <CardContent>
            {data.byAgent.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={data.byAgent}
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `$${v.toFixed(2)}`}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="agent"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    formatter={fmtCost}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="cost">
                    {data.byAgent.map((entry) => (
                      <Cell
                        key={entry.agent}
                        fill={AGENT_COLORS[entry.agent] || "#6366f1"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Daily Cost Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byDay.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.byDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tickFormatter={(v) => `$${v.toFixed(2)}`}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  formatter={fmtCost}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                {Object.keys(MODEL_COLORS).map((model) => (
                  <Area
                    key={model}
                    type="monotone"
                    dataKey={`byModel.${model}`}
                    name={model.replace("claude-", "")}
                    stackId="1"
                    stroke={MODEL_COLORS[model]}
                    fill={MODEL_COLORS[model]}
                    fillOpacity={0.3}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
