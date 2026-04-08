"use client";

import Link from "next/link";
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
import type { SessionSummary } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

export function RecentSessions({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No sessions yet
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Models</TableHead>
                <TableHead>Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.slice(0, 5).map((session) => (
                <TableRow key={session.id} className="cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/sessions/${session.id}`}
                      className="hover:underline text-primary"
                    >
                      {formatDistanceToNow(new Date(session.timestamp), {
                        addSuffix: true,
                      })}
                    </Link>
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
        )}
      </CardContent>
    </Card>
  );
}
