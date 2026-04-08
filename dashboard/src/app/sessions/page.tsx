"use client";

import Link from "next/link";
import { usePolling } from "@/hooks/use-polling";
import type { SessionSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

export default function SessionsPage() {
  const { data, isLoading } = usePolling<{
    sessions: SessionSummary[];
    total: number;
  }>("/api/sessions?limit=100");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Sessions</h2>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const sessions = data?.sessions || [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Sessions ({data?.total || 0})</h2>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Messages</TableHead>
            <TableHead>Cost</TableHead>
            <TableHead>Tokens</TableHead>
            <TableHead>Models</TableHead>
            <TableHead>Agents</TableHead>
            <TableHead>Errors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => (
            <TableRow key={session.id}>
              <TableCell>
                <Link
                  href={`/sessions/${session.id}`}
                  className="hover:underline text-primary font-medium"
                >
                  {formatDistanceToNow(new Date(session.timestamp), {
                    addSuffix: true,
                  })}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDuration(session.duration)}
              </TableCell>
              <TableCell>{session.messageCount}</TableCell>
              <TableCell>${session.totalCost.toFixed(4)}</TableCell>
              <TableCell>{session.totalTokens.toLocaleString()}</TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {session.models.map((m) => (
                    <Badge key={m} variant="secondary" className="text-xs">
                      {m.replace("claude-", "").replace("qwen2.5-coder:", "qwen ")}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {session.agents.map((a) => (
                    <Badge key={a} variant="outline" className="text-xs">
                      {a}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                {session.errors > 0 ? (
                  <Badge variant="destructive">{session.errors}</Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
