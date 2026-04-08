"use client";

import { usePolling } from "@/hooks/use-polling";
import type { ToolStats } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function ToolsPage() {
  const { data, isLoading } = usePolling<{ tools: ToolStats[] }>("/api/tools");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Tools</h2>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const tools = data?.tools || [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Tools</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage frequency */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Usage Frequency</CardTitle>
          </CardHeader>
          <CardContent>
            {tools.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={tools.slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="callCount" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Error rates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Error Rate by Tool</CardTitle>
          </CardHeader>
          <CardContent>
            {tools.filter((t) => t.errors > 0).length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No errors
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={tools.filter((t) => t.errors > 0)}
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => `${Number(v ?? 0).toFixed(1)}%`}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="errorRate" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead>Error Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((tool) => (
                <TableRow key={tool.name}>
                  <TableCell className="font-medium">{tool.name}</TableCell>
                  <TableCell>{tool.callCount}</TableCell>
                  <TableCell>
                    {tool.errors > 0 ? (
                      <Badge variant="destructive">{tool.errors}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        tool.errorRate > 10 ? "text-red-500 font-medium" : ""
                      }
                    >
                      {tool.errorRate.toFixed(1)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
