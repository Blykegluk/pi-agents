"use client";

import { use } from "react";
import { usePolling } from "@/hooks/use-polling";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, User, Bot, Wrench, AlertCircle } from "lucide-react";
import type {
  JournalEvent,
  SessionSummary,
  MessageEvent,
  AssistantMessage,
  ToolResultMessage,
  UserMessage,
  ToolCallContent,
} from "@/lib/types";
import { AGENT_COLORS } from "@/lib/constants";

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading } = usePolling<{
    events: JournalEvent[];
    summary: SessionSummary;
  }>(`/api/sessions/${id}`, 10000);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Session Detail</h2>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Session Not Found</h2>
      </div>
    );
  }

  const { events, summary } = data;
  const messageEvents = events.filter(
    (e): e is MessageEvent => e.type === "message"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Session Detail</h2>
        <div className="flex gap-2 mt-2 flex-wrap items-center">
          <Badge variant="outline" className="font-mono text-xs">
            {summary.id}
          </Badge>
          <Badge variant="secondary">{summary.cwd}</Badge>
          <Badge variant="secondary">${summary.totalCost.toFixed(4)}</Badge>
          <Badge variant="secondary">
            {summary.totalTokens.toLocaleString()} tokens
          </Badge>
          {summary.models.map((m) => (
            <Badge key={m} variant="outline">
              {m}
            </Badge>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {messageEvents.map((event) => (
          <MessageCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function MessageCard({ event }: { event: MessageEvent }) {
  const msg = event.message;

  if (msg.role === "user") {
    const userMsg = msg as UserMessage;
    const text = userMsg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");

    return (
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4 text-blue-500" />
            User
            <span className="text-xs text-muted-foreground font-normal">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm">{text}</pre>
        </CardContent>
      </Card>
    );
  }

  if (msg.role === "assistant") {
    const assistant = msg as AssistantMessage;
    const textBlocks = assistant.content.filter((b) => b.type === "text");
    const toolCalls = assistant.content.filter(
      (b) => b.type === "toolCall"
    ) as ToolCallContent[];

    return (
      <Card className="border-l-4 border-l-purple-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-500" />
            Assistant
            <Badge variant="outline" className="text-xs">
              {assistant.model}
            </Badge>
            {assistant.usage && (
              <span className="text-xs text-muted-foreground font-normal">
                ${assistant.usage.cost.total.toFixed(4)} |{" "}
                {assistant.usage.totalTokens.toLocaleString()} tokens
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {textBlocks.map((block, i) => (
            <pre key={i} className="whitespace-pre-wrap text-sm">
              {(block as { text: string }).text}
            </pre>
          ))}
          {toolCalls.map((tc) => (
            <div
              key={tc.id}
              className="bg-muted/50 rounded-md p-3 text-sm border"
            >
              <div className="flex items-center gap-2 font-medium">
                <Wrench className="h-3 w-3" />
                {tc.name}
              </div>
              <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto">
                {JSON.stringify(tc.arguments, null, 2)}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (msg.role === "toolResult") {
    const tr = msg as ToolResultMessage;
    const textContent = tr.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const hasSubagent = tr.details?.results && tr.details.results.length > 0;

    return (
      <Card
        className={`border-l-4 ${tr.isError ? "border-l-red-500" : "border-l-green-500"}`}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {tr.isError ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : (
              <Wrench className="h-4 w-4 text-green-500" />
            )}
            {tr.toolName}
            {tr.isError && <Badge variant="destructive">Error</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasSubagent ? (
            <div className="space-y-3">
              {tr.details!.results.map((result, i) => (
                <Collapsible key={i}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded-md p-2 -mx-2">
                    <ChevronDown className="h-4 w-4" />
                    <span
                      className="font-medium"
                      style={{
                        color: AGENT_COLORS[result.agent] || "#888",
                      }}
                    >
                      {result.agent}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {result.model}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      ${result.usage?.cost?.toFixed(4) || "0"} |{" "}
                      {result.usage?.contextTokens?.toLocaleString() || 0}{" "}
                      tokens | exit: {result.exitCode}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 pl-6 border-l-2 space-y-2">
                      <div className="text-xs text-muted-foreground">
                        <strong>Task:</strong> {result.task}
                      </div>
                      {result.messages?.map((m, j) => {
                        const texts = m.content
                          .filter((b) => b.type === "text")
                          .map((b) => (b as { text: string }).text)
                          .join("\n");
                        if (!texts) return null;
                        return (
                          <div key={j} className="text-sm">
                            <span className="text-xs font-medium text-muted-foreground">
                              {m.role}:
                            </span>
                            <pre className="whitespace-pre-wrap mt-1 max-h-96 overflow-y-auto">
                              {texts.length > 2000
                                ? texts.slice(0, 2000) + "\n... (truncated)"
                                : texts}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm max-h-64 overflow-y-auto">
              {textContent.length > 2000
                ? textContent.slice(0, 2000) + "\n... (truncated)"
                : textContent}
            </pre>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
}
