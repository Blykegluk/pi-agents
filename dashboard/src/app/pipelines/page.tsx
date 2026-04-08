"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePolling } from "@/hooks/use-polling";
import type { Workflow, AgentConfig, AgentLink } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AGENT_COLORS, MODEL_COLORS } from "@/lib/constants";
import {
  ArrowRight,
  Play,
  Pencil,
  Plus,
  Trash2,
  Zap,
  Clock,
  Bot,
  GitBranch,
  ChevronRight,
  ArrowRightLeft,
  Layers,
  Upload,
  AlertCircle,
} from "lucide-react";

function modelLabel(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  if (model.includes("qwen")) return "Qwen";
  return model;
}

/**
 * Build ordered execution chains from workflow links.
 * Returns arrays of agent chains (each chain is a linear path).
 */
function buildChains(agents: string[], links: AgentLink[]): string[][] {
  if (links.length === 0) return agents.length > 0 ? [agents] : [];

  const targets = new Set(links.map((l) => l.targetAgent));
  const roots = agents.filter((a) => !targets.has(a));
  if (roots.length === 0) return [agents];

  const chains: string[][] = [];

  function follow(agent: string, chain: string[]) {
    chain.push(agent);
    const outLinks = links.filter((l) => l.sourceAgent === agent && agents.includes(l.targetAgent));
    if (outLinks.length === 0) {
      chains.push([...chain]);
    } else if (outLinks.length === 1) {
      follow(outLinks[0].targetAgent, chain);
    } else {
      // Fork: each target starts a new chain branch
      for (const link of outLinks) {
        follow(link.targetAgent, [...chain]);
      }
    }
  }

  for (const root of roots) {
    follow(root, []);
  }

  // Add orphan agents (not in any link) as a single chain
  const linkedAgents = new Set(chains.flat());
  const orphans = agents.filter((a) => !linkedAgents.has(a));
  if (orphans.length > 0) {
    chains.push(orphans);
  }

  return chains;
}

/**
 * Get link between two adjacent agents in a chain.
 */
function getLinkBetween(
  source: string,
  target: string,
  links: AgentLink[]
): AgentLink | undefined {
  return links.find((l) => l.sourceAgent === source && l.targetAgent === target);
}

export default function PipelinesPage() {
  const router = useRouter();
  const { data: wfData, isLoading, refresh } = usePolling<{ workflows: Workflow[] }>("/api/workflows");
  const { data: agData } = usePolling<{ agents: AgentConfig[] }>("/api/agents");

  const workflows = wfData?.workflows || [];
  const agents = agData?.agents || [];

  // Only show workflows that have links (i.e., are actual pipelines)
  const pipelines = workflows.filter((wf) => wf.links.length > 0);
  const standalonePipelines = workflows.filter((wf) => wf.links.length === 0 && wf.agents.length > 1);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this pipeline workflow?")) return;
    await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    refresh();
  };

  const handleGeneratePrompt = async (wf: Workflow) => {
    // Re-save to regenerate prompt file
    await fetch(`/api/workflows/${wf.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wf),
    });
    alert(`Pipeline prompt generated: workflow-${wf.id}.md\n\nLocated in ~/.pi/agent/prompts/`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Pipelines</h2>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" />
            Pipelines
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Visual overview of agent-to-agent data flows
          </p>
        </div>
        <Link href="/agents/workflow/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Pipeline
          </Button>
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <MiniStat label="Total Pipelines" value={pipelines.length} icon={GitBranch} />
        <MiniStat label="Active Links" value={pipelines.reduce((s, w) => s + w.links.length, 0)} icon={ArrowRightLeft} />
        <MiniStat label="Agents Used" value={new Set(pipelines.flatMap((w) => w.agents)).size} icon={Bot} />
        <MiniStat label="Cron Triggers" value={pipelines.reduce((s, w) => s + w.links.filter((l) => l.trigger.type === "cron").length, 0)} icon={Clock} />
      </div>

      {/* Pipeline cards */}
      {pipelines.length === 0 && standalonePipelines.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <GitBranch className="h-14 w-14 text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-medium mb-2">No pipelines yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Pipelines connect agents together so that the output of one flows into the next.
              Create a workflow and add pipeline links to get started.
            </p>
            <Link href="/agents/workflow/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Pipeline
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pipelines.map((wf) => (
            <PipelineCard
              key={wf.id}
              workflow={wf}
              agents={agents}
              onEdit={() => router.push(`/agents/workflow/${wf.id}`)}
              onRun={() => router.push(`/agents/workflow/${wf.id}/run`)}
              onDelete={() => handleDelete(wf.id)}
              onGenerate={() => handleGeneratePrompt(wf)}
            onPublish={() => router.push(`/pipelines/${wf.id}/publish`)}
            />
          ))}

          {/* Standalone workflows without links */}
          {standalonePipelines.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Workflows without links ({standalonePipelines.length})
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  These workflows have multiple agents but no pipeline links defined. Add links to connect them.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {standalonePipelines.map((wf) => (
                    <Card key={wf.id} className="border-dashed hover:border-primary/30 transition-colors cursor-pointer" onClick={() => router.push(`/agents/workflow/${wf.id}`)}>
                      <CardContent className="py-3 px-4 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm">{wf.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {wf.agents.length} agents
                          </span>
                        </div>
                        <Button size="sm" variant="ghost">
                          <Plus className="h-3 w-3 mr-1" /> Add Links
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Mini Stat Card
// ============================================================

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="text-xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Pipeline Card — visual flow representation
// ============================================================

function PipelineCard({
  workflow,
  agents,
  onEdit,
  onRun,
  onDelete,
  onGenerate,
  onPublish,
}: {
  workflow: Workflow;
  agents: AgentConfig[];
  onEdit: () => void;
  onRun: () => void;
  onDelete: () => void;
  onGenerate: () => void;
  onPublish: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const chains = buildChains(workflow.agents, workflow.links);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <GitBranch className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {workflow.name}
                {!workflow.enabled && (
                  <Badge variant="secondary" className="text-xs">Paused</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {workflow.description} · {workflow.links.length} link{workflow.links.length !== 1 ? "s" : ""} · {workflow.agents.length} agent{workflow.agents.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={onPublish} title="Publish as Pi Agent prompt">
              <Upload className="h-3 w-3 mr-1" />
              Publish
            </Button>
            <Button size="sm" onClick={onRun}>
              <Play className="h-3 w-3 mr-1" />
              Run
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Visual pipeline flow */}
        {chains.map((chain, ci) => (
          <div key={ci} className="relative">
            {chains.length > 1 && (
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {ci === 0 ? "Main chain" : `Branch ${ci}`}
              </div>
            )}
            <div className="flex items-center gap-0 overflow-x-auto pb-2">
              {chain.map((agentName, ai) => {
                const agent = agents.find((a) => a.name === agentName);
                const color = AGENT_COLORS[agentName] || "#6366f1";
                const dotColor = MODEL_COLORS[agent?.model || ""] || "#888";
                const link = ai > 0 ? getLinkBetween(chain[ai - 1], agentName, workflow.links) : null;

                return (
                  <div key={agentName} className="flex items-center">
                    {/* Link arrow */}
                    {ai > 0 && (
                      <div className="flex flex-col items-center mx-1">
                        <div className="flex items-center gap-0.5">
                          <div className="w-8 h-px bg-border" />
                          <div className="flex flex-col items-center">
                            {link?.trigger.type === "cron" ? (
                              <div className="flex items-center gap-0.5 bg-blue-500/10 text-blue-500 rounded-full px-1.5 py-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                <span className="text-[9px] font-mono">{link.trigger.cronExpression}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5 bg-amber-500/10 text-amber-500 rounded-full px-1.5 py-0.5">
                                <Zap className="h-2.5 w-2.5" />
                                <span className="text-[9px]">event</span>
                              </div>
                            )}
                          </div>
                          <div className="w-4 h-px bg-border" />
                          <ChevronRight className="h-3 w-3 text-muted-foreground -ml-1.5" />
                        </div>
                      </div>
                    )}

                    {/* Agent node */}
                    <div
                      className="relative border rounded-xl px-4 py-3 min-w-[150px] bg-card hover:shadow-sm transition-shadow shrink-0"
                      style={{ borderTopColor: color, borderTopWidth: "3px" }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-semibold text-sm capitalize truncate">
                          {agentName.replace(/-/g, " ")}
                        </span>
                      </div>
                      {agent && (
                        <div className="flex items-center gap-1.5 ml-[18px]">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: dotColor }}
                          />
                          <span className="text-[11px] text-muted-foreground">
                            {modelLabel(agent.model)}
                          </span>
                        </div>
                      )}
                      {agent?.tools && agent.tools.length > 0 && (
                        <div className="flex gap-0.5 mt-1.5 ml-[18px] flex-wrap">
                          {agent.tools.slice(0, 3).map((tool) => (
                            <span key={tool} className="text-[9px] bg-muted rounded px-1 py-0.5 text-muted-foreground">
                              {tool}
                            </span>
                          ))}
                          {agent.tools.length > 3 && (
                            <span className="text-[9px] text-muted-foreground">+{agent.tools.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Expanded: show link details */}
        {expanded && (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Link Details
            </div>
            {workflow.links.map((link) => (
              <div key={link.id} className="flex items-start gap-3 text-sm bg-muted/30 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: AGENT_COLORS[link.sourceAgent] || "#6366f1" }}
                  />
                  <span className="font-medium capitalize text-xs">{link.sourceAgent.replace(/-/g, " ")}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: AGENT_COLORS[link.targetAgent] || "#6366f1" }}
                  />
                  <span className="font-medium capitalize text-xs">{link.targetAgent.replace(/-/g, " ")}</span>
                </div>
                <Separator orientation="vertical" className="h-4 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {link.trigger.type === "cron" ? (
                      <>
                        <Clock className="h-3 w-3 text-blue-500" />
                        <span className="text-xs font-mono text-blue-500">{link.trigger.cronExpression}</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-3 w-3 text-amber-500" />
                        <span className="text-xs text-amber-500">On output</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {link.taskTemplate}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
            className="text-xs"
          >
            {expanded ? "Hide details" : "Show details"}
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
