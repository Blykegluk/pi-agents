"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { usePolling } from "@/hooks/use-polling";
import type { Workflow, AgentConfig, AgentLink } from "@/lib/types";
import type { RunStatus } from "@/lib/runner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_COLORS } from "@/lib/constants";
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  Settings,
  Clock,
  Zap,
  Bot,
  Search,
  FileText,
  Code,
  Eye,
  Video,
  Loader2,
  Square,
  Send,
  Terminal,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

const AGENT_ICONS: Record<string, React.ElementType> = {
  scout: Search,
  planner: FileText,
  worker: Code,
  reviewer: Eye,
  "video-creator": Video,
  "video-generator": Video,
  "youtube-publisher": Play,
  "tiktok-publisher": Play,
};

const MODEL_DOT_COLORS: Record<string, string> = {
  "claude-opus-4-6": "#7c3aed",
  "claude-sonnet-4-6": "#2563eb",
  "claude-haiku-4-5": "#059669",
  "qwen2.5-coder:7b": "#d97706",
};

function modelLabel(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  if (model.includes("qwen")) return "Qwen";
  return model;
}

/**
 * Topological sort: order agents by link dependencies.
 * Sources (no incoming links) come first.
 */
function topoSort(agents: string[], links: AgentLink[]): string[] {
  if (links.length === 0) return agents;

  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const a of agents) {
    inDegree.set(a, 0);
    children.set(a, []);
  }

  for (const link of links) {
    if (agents.includes(link.sourceAgent) && agents.includes(link.targetAgent)) {
      inDegree.set(link.targetAgent, (inDegree.get(link.targetAgent) || 0) + 1);
      children.get(link.sourceAgent)?.push(link.targetAgent);
    }
  }

  // BFS from sources
  const queue = agents.filter((a) => (inDegree.get(a) || 0) === 0);
  const result: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    result.push(node);

    for (const child of children.get(node) || []) {
      inDegree.set(child, (inDegree.get(child) || 0) - 1);
      if ((inDegree.get(child) || 0) <= 0 && !visited.has(child)) {
        queue.push(child);
      }
    }
  }

  // Add any remaining unlinked agents
  for (const a of agents) {
    if (!visited.has(a)) result.push(a);
  }

  return result;
}

/**
 * Build tree layers from links for hierarchical display.
 * Returns arrays of agents at each depth level.
 */
function buildLayers(agents: string[], links: AgentLink[]): string[][] {
  if (agents.length === 0) return [];
  if (links.length === 0) return [agents];

  const targets = new Set(links.map((l) => l.targetAgent));
  const roots = agents.filter((a) => !targets.has(a));
  if (roots.length === 0) return [agents]; // no clear root, flat

  const layers: string[][] = [roots];
  const placed = new Set(roots);

  // BFS layer by layer
  let currentLayer = roots;
  while (placed.size < agents.length) {
    const nextLayer: string[] = [];
    for (const node of currentLayer) {
      for (const link of links) {
        if (link.sourceAgent === node && agents.includes(link.targetAgent) && !placed.has(link.targetAgent)) {
          nextLayer.push(link.targetAgent);
          placed.add(link.targetAgent);
        }
      }
    }
    if (nextLayer.length === 0) {
      // Add remaining unlinked agents to last layer
      const remaining = agents.filter((a) => !placed.has(a));
      if (remaining.length > 0) layers.push(remaining);
      break;
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  return layers;
}

export default function AgentsPage() {
  const { data: wfData, isLoading: wfLoading, refresh: refreshWf } =
    usePolling<{ workflows: Workflow[] }>("/api/workflows");
  const { data: agData } =
    usePolling<{ agents: AgentConfig[] }>("/api/agents");
  const { data: runsData } =
    usePolling<{ runs: RunStatus[] }>("/api/runs", 3000);

  const router = useRouter();

  // Set of agents currently running
  const runningAgents = new Set(
    (runsData?.runs || [])
      .filter((r) => r.status === "running")
      .map((r) => r.agent)
  );

  if (wfLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Workflows</h2>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const workflows = wfData?.workflows || [];
  const agents = agData?.agents || [];

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this workflow?")) return;
    await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    refreshWf();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Workflows</h2>
        <Link href="/agents/workflow/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Workflow
          </Button>
        </Link>
      </div>

      {workflows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">No workflows yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Create your first workflow to orchestrate agents into automated
              pipelines — video production, web scraping, content research, etc.
            </p>
            <Link href="/agents/workflow/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Workflow
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              agents={agents}
              runningAgents={runningAgents}
              onEdit={() => router.push(`/agents/workflow/${wf.id}`)}
              activeRuns={runsData?.runs?.filter((r) => r.status === "running" && r.agent === wf.name) || []}
              onRun={() => router.push(`/agents/workflow/${wf.id}/run`)}
              onStop={async (runId) => {
                await fetch(`/api/workflows/${wf.id}/run`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "stop", runId }),
                });
              }}
              onDelete={() => handleDelete(wf.id)}
              onEditAgent={(agentName) => router.push(`/agents/${agentName}`)}
              onRunAgent={(agentName) => router.push(`/agents/${agentName}/run`)}
            />
          ))}
        </div>
      )}

      {/* Standalone agents section */}
      {agents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              All Agents ({agents.length})
            </h3>
            <Link href="/agents/new">
              <Button variant="outline" size="sm">
                <Plus className="h-3 w-3 mr-1" />
                New Agent
              </Button>
            </Link>
          </div>
          <div className="flex gap-2 flex-wrap">
            {agents.map((agent) => (
              <Link key={agent.name} href={`/agents/${agent.name}`}>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-muted py-1.5 px-3 text-sm gap-2"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: AGENT_COLORS[agent.name] || "#6366f1",
                    }}
                  />
                  {agent.name}
                  <span className="text-muted-foreground font-normal">
                    {modelLabel(agent.model)}
                  </span>
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Mini Terminal — shows active runs */}
      <RunTerminal runs={runsData?.runs || []} />
    </div>
  );
}

// ============================================================
// Run Terminal — persistent mini terminal at bottom
// ============================================================

function RunTerminal({ runs }: { runs: RunStatus[] }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [dismissedRunIds, setDismissedRunIds] = useState<Set<string>>(new Set());
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Re-run workflow with user's reply as follow-up context
  const handleReply = async () => {
    if (!replyText.trim() || !displayRun) return;
    setSending(true);

    // Extract workflow ID from the run ID (format: workflow-{wfId}-{timestamp})
    const wfIdMatch = displayRun.runId.match(/workflow-(wf-\d+)-/);
    const wfId = wfIdMatch?.[1];

    if (!wfId) {
      // For individual agent runs, re-run the agent
      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: displayRun.agent,
            task: `Previous output:\n${displayRun.output.join("")}\n\nUser response: ${replyText}`,
          }),
        });
        // Read SSE to trigger the run
        const reader = res.body?.getReader();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = new TextDecoder().decode(value);
            const lines = text.split("\n\n").filter((l: string) => l.startsWith("data: "));
            for (const line of lines) {
              try {
                const json = JSON.parse(line.slice(6));
                if (json.type === "started") {
                  setSelectedRunId(json.runId);
                }
              } catch {}
            }
            // Break after getting the started event
            break;
          }
        }
      } catch {}
    } else {
      // Re-run workflow with context
      try {
        const res = await fetch(`/api/workflows/${wfId}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: `Previous step output:\n${displayRun.output.join("")}\n\nUser instruction: ${replyText}`,
          }),
        });
        const reader = res.body?.getReader();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = new TextDecoder().decode(value);
            const lines = text.split("\n\n").filter((l: string) => l.startsWith("data: "));
            for (const line of lines) {
              try {
                const json = JSON.parse(line.slice(6));
                if (json.type === "started") {
                  setSelectedRunId(json.runId);
                }
              } catch {}
            }
            break;
          }
        }
      } catch {}
    }

    setReplyText("");
    setSending(false);
  };

  const activeRuns = runs.filter((r) => r.status === "running");
  const recentRuns = runs.filter((r) => !dismissedRunIds.has(r.runId)).slice(0, 10);

  const dismissRun = (runId: string) => {
    setDismissedRunIds((prev) => new Set([...prev, runId]));
    if (selectedRunId === runId) {
      const remaining = recentRuns.filter((r) => r.runId !== runId);
      setSelectedRunId(remaining.length > 0 ? remaining[0].runId : null);
    }
  };

  // Auto-select and expand when a new run starts
  useEffect(() => {
    if (activeRuns.length > 0) {
      setSelectedRunId(activeRuns[0].runId);
      setExpanded(true);
    }
  }, [activeRuns.length]);

  // Poll selected run for fresh output
  const { data: selectedRun } = usePolling<RunStatus>(
    selectedRunId ? `/api/runs/${selectedRunId}` : "/api/runs",
    2000
  );

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedRun]);

  const displayRun = selectedRunId
    ? (selectedRun as RunStatus | undefined) || runs.find((r) => r.runId === selectedRunId)
    : null;

  return (
    <div className="fixed bottom-0 left-60 right-0 z-50 border-t bg-card shadow-lg">
      {/* Header bar — always visible */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Terminal</span>
          {activeRuns.length > 0 ? (
            <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0 flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {activeRuns.length} active
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              {recentRuns.length > 0
                ? `${recentRuns.length} recent`
                : "No runs yet"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Run tabs */}
          {recentRuns.length > 0 && (
            <div className="flex gap-1">
              {recentRuns.slice(0, 5).map((run) => (
                <button
                  key={run.runId}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRunId(run.runId);
                    setExpanded(true);
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors capitalize ${
                    selectedRunId === run.runId
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {run.agent.replace(/-/g, " ")}
                  {run.status === "running" && (
                    <Loader2 className="h-2 w-2 animate-spin inline ml-1" />
                  )}
                  {run.status === "done" && run.exitCode === 0 && " ok"}
                  {run.status === "done" && run.exitCode !== 0 && " err"}
                  {run.status === "error" && " err"}
                  {run.status !== "running" && (
                    <span
                      className="ml-1 hover:text-destructive inline-flex"
                      onClick={(e2) => {
                        e2.stopPropagation();
                        dismissRun(run.runId);
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Terminal body */}
      {expanded && (
        <div className="border-t">
          {displayRun ? (
            <>
              <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/30 text-xs text-muted-foreground">
                <span className="capitalize font-medium text-foreground">
                  {displayRun.agent.replace(/-/g, " ")}
                </span>
                <span>|</span>
                {displayRun.status === "running" ? (
                  <span className="text-green-500 flex items-center gap-1">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Running for {Math.round((Date.now() - displayRun.startedAt) / 1000)}s
                    <button
                      className="ml-2 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await fetch("/api/run", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "stop", runId: displayRun.runId }),
                        });
                      }}
                    >
                      Stop
                    </button>
                  </span>
                ) : displayRun.status === "done" ? (
                  <span className={displayRun.exitCode === 0 ? "text-green-500" : "text-red-500"}>
                    Finished (exit {displayRun.exitCode}) in{" "}
                    {displayRun.endedAt
                      ? ((displayRun.endedAt - displayRun.startedAt) / 1000).toFixed(1)
                      : "?"}s
                  </span>
                ) : (
                  <span className="text-red-500">Error: {displayRun.error}</span>
                )}
              </div>
              <ScrollArea className="h-[200px] px-4 py-2" ref={scrollRef}>
                <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                  {displayRun.output?.length
                    ? displayRun.output.join("")
                    : "Waiting for output..."}
                </pre>
              </ScrollArea>
              {/* Reply input — shown when run is done and awaiting response */}
              {displayRun.status === "done" && displayRun.output?.length > 0 && (
                <div className="flex gap-2 px-4 py-2 border-t bg-muted/20">
                  <Input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder='Type your response (e.g. "Approved, proceed" or "Change the hook")...'
                    className="flex-1 h-8 text-sm"
                    disabled={sending}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && replyText.trim() && !sending) {
                        handleReply();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!replyText.trim() || sending}
                    onClick={handleReply}
                  >
                    {sending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="h-[100px] flex items-center justify-center text-sm text-muted-foreground">
              <div className="text-center">
                <Terminal className="h-6 w-6 mx-auto mb-2 opacity-30" />
                No runs yet — click Run on an agent or workflow to start
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Workflow Card with hierarchical org chart
// ============================================================

function WorkflowCard({
  workflow,
  agents,
  runningAgents,
  activeRuns,
  onEdit,
  onRun,
  onStop,
  onDelete,
  onEditAgent,
  onRunAgent,
}: {
  workflow: Workflow;
  agents: AgentConfig[];
  runningAgents: Set<string>;
  activeRuns: RunStatus[];
  onEdit: () => void;
  onRun: () => void;
  onStop: (runId: string) => void;
  onDelete: () => void;
  onEditAgent: (name: string) => void;
  onRunAgent: (name: string) => void;
}) {
  const layers = buildLayers(workflow.agents, workflow.links);
  const isRunning = activeRuns.length > 0;

  return (
    <Card className={`transition-shadow ${isRunning ? "ring-2 ring-green-500/30 shadow-lg shadow-green-500/5" : "hover:shadow-md"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              {workflow.name}
              {isRunning && (
                <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0 flex items-center gap-1 animate-pulse">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Running
                </Badge>
              )}
              {!workflow.enabled && !isRunning && (
                <Badge variant="secondary" className="text-xs">
                  Paused
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {workflow.description}
            </p>
            {workflow.schedule?.enabled && (
              <div className="flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3 text-blue-400" />
                <span className="text-xs text-blue-400">
                  Daily at {workflow.schedule.cronExpression.split(" ")[1]?.padStart(2, "0")}:{workflow.schedule.cronExpression.split(" ")[0]?.padStart(2, "0")} ({workflow.schedule.timezone?.replace("Europe/", "")})
                </span>
              </div>
            )}
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            <Settings className="h-3 w-3 mr-1" />
            {modelLabel(workflow.orchestrator.model)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Hierarchical org chart */}
        <div className="flex flex-col items-center gap-0 py-2">
          {/* Orchestrator node */}
          <AgentNode
            name="Orchestrator"
            description={`Thinking: ${workflow.orchestrator.thinkingLevel}`}
            model={workflow.orchestrator.model}
            icon={Settings}
            color={AGENT_COLORS.orchestrator || "#6366f1"}
            onEdit={onEdit}
          />

          {layers.map((layer, layerIdx) => (
            <div key={layerIdx} className="flex flex-col items-center">
              {/* Vertical connector — animated when running */}
              <div className={`w-px h-6 ${isRunning ? "connector-running-v w-[2px]" : "bg-border"}`} />

              {layer.length > 1 && (
                <div className="relative w-full flex justify-center">
                  <div
                    className={`absolute top-0 ${isRunning ? "connector-running-h h-[2px]" : "h-px bg-border"}`}
                    style={{
                      width: `${(layer.length - 1) * 210}px`,
                      left: `calc(50% - ${((layer.length - 1) * 210) / 2}px)`,
                    }}
                  />
                </div>
              )}

              <div className="flex gap-4 justify-center">
                {layer.map((agentName) => {
                  const agent = agents.find((a) => a.name === agentName);
                  const linkToThis = workflow.links.find(
                    (l) => l.targetAgent === agentName
                  );
                  const Icon = AGENT_ICONS[agentName] || Bot;

                  return (
                    <div key={agentName} className="flex flex-col items-center">
                      {layer.length > 1 && (
                        <div className={`w-px h-5 ${isRunning ? "connector-running-v w-[2px]" : "bg-border"}`} />
                      )}
                      {linkToThis && (
                        <div className="flex items-center gap-0.5 text-muted-foreground mb-1">
                          {linkToThis.trigger.type === "cron" ? (
                            <Clock className="h-3 w-3 text-blue-400" />
                          ) : (
                            <Zap className="h-3 w-3 text-amber-400" />
                          )}
                        </div>
                      )}
                      <AgentNode
                        name={agentName}
                        description={
                          agent?.description?.split(" ").slice(0, 4).join(" ") || ""
                        }
                        model={agent?.model || ""}
                        icon={Icon}
                        color={AGENT_COLORS[agentName] || "#6366f1"}
                        isRunning={runningAgents.has(agentName)}
                        onEdit={() => onEditAgent(agentName)}
                        onRun={() => onRunAgent(agentName)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Workflow-level actions */}
        <div className="flex gap-2 pt-1">
          {isRunning ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (activeRuns[0]) onStop(activeRuns[0].runId);
              }}
            >
              <Square className="h-3 w-3 mr-1" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={onRun}>
              <Play className="h-3 w-3 mr-1" />
              Run All
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-1" />
            Edit Workflow
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive ml-auto"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Agent Node — full card with model, description, hover actions
// ============================================================

function AgentNode({
  name,
  description,
  model,
  icon: Icon,
  color,
  isRunning,
  onEdit,
  onRun,
}: {
  name: string;
  description: string;
  model: string;
  icon: React.ElementType;
  color: string;
  isRunning?: boolean;
  onEdit?: () => void;
  onRun?: () => void;
}) {
  const dotColor = MODEL_DOT_COLORS[model] || "#888";
  return (
    <div
      className={`group relative bg-card border rounded-xl px-5 py-4 min-w-[180px] shadow-sm hover:shadow-md transition-shadow cursor-default ${
        isRunning ? "ring-2 ring-green-500/50" : ""
      }`}
      style={{ borderTopColor: color, borderTopWidth: "3px" }}
    >
      {/* Running indicator */}
      {isRunning && (
        <div className="absolute -top-2 -right-2 z-10">
          <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0 flex items-center gap-1 animate-pulse">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            Running
          </Badge>
        </div>
      )}

      <div className="flex items-center gap-2.5 mb-1">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <span className="font-semibold text-sm capitalize">
          {name.replace(/-/g, " ")}
        </span>
      </div>

      <p className="text-xs text-muted-foreground ml-[38px] -mt-0.5 mb-2 truncate max-w-[140px]">
        {description}
      </p>

      {model && (
        <div className="flex items-center gap-1.5 ml-[38px]">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-xs text-muted-foreground">
            {modelLabel(model)}
          </span>
        </div>
      )}

      {/* Hover actions */}
      {(onEdit || onRun) && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          {onEdit && (
            <button
              onClick={onEdit}
              className="bg-card border rounded-md p-1.5 shadow-sm hover:bg-muted transition-colors"
              title="Edit"
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
          {onRun && (
            <button
              onClick={onRun}
              className="bg-card border rounded-md p-1.5 shadow-sm hover:bg-muted transition-colors"
              title="Run"
            >
              <Play className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
