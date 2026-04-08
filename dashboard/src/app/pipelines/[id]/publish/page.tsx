"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Upload,
  Check,
  Copy,
  FileText,
  GitBranch,
  Eye,
  Download,
  Zap,
  Clock,
  ArrowRight,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
import Link from "next/link";
import type { Workflow, AgentLink } from "@/lib/types";
import { AGENT_COLORS } from "@/lib/constants";

function modelLabel(model: string): string {
  if (model.includes("opus")) return "Claude Opus";
  if (model.includes("sonnet")) return "Claude Sonnet";
  if (model.includes("haiku")) return "Claude Haiku";
  if (model.includes("qwen")) return "Qwen 7B";
  return model;
}

/**
 * Build chain order from links (topological sort).
 */
function buildChainOrder(workflow: Workflow): string[] {
  const { links, agents } = workflow;
  if (links.length === 0) return agents;

  const targets = new Set(links.map((l) => l.targetAgent));
  const sources = agents.filter((a) => !targets.has(a));

  const order: string[] = [];
  const visited = new Set<string>();

  function visit(agent: string) {
    if (visited.has(agent)) return;
    visited.add(agent);
    order.push(agent);
    for (const link of links) {
      if (link.sourceAgent === agent) {
        visit(link.targetAgent);
      }
    }
  }

  for (const source of sources) {
    visit(source);
  }

  for (const agent of agents) {
    if (!visited.has(agent)) order.push(agent);
  }

  return order;
}

/**
 * Generate the prompt file content for a pipeline.
 */
function generatePromptContent(workflow: Workflow, format: "chain" | "parallel" | "sequential"): string {
  const chain = buildChainOrder(workflow);

  if (format === "chain") {
    const steps = chain.map((agent, i) => {
      if (i === 0) {
        return `${i + 1}. Use the "${agent}" agent to execute: $@`;
      }
      return `${i + 1}. Then, use the "${agent}" agent to process the output from the previous step (use {previous} placeholder)`;
    });

    return `---
description: "${workflow.name} — ${workflow.description}"
---
Use the subagent tool with the chain parameter to execute this workflow:

${steps.join("\n")}

Execute this as a chain, passing output between steps via {previous}.
`;
  }

  if (format === "parallel") {
    const tasks = chain.map((agent, i) => {
      return `  - agent: "${agent}"\n    task: "$@"`;
    });

    return `---
description: "${workflow.name} — ${workflow.description}"
---
Use the subagent tool with the tasks parameter to execute all agents in parallel:

Agents:
${tasks.join("\n")}

Execute all tasks simultaneously using parallel mode.
`;
  }

  // sequential — step by step with explicit instructions
  const steps = chain.map((agent, i) => {
    const inLink = workflow.links.find((l) => l.targetAgent === agent);
    const taskTpl = inLink?.taskTemplate || "$@";
    const triggerNote = inLink
      ? inLink.trigger.type === "cron"
        ? ` (scheduled: ${inLink.trigger.cronExpression})`
        : " (triggered on previous output)"
      : "";

    return `### Step ${i + 1}: ${agent}${triggerNote}
Use the subagent tool in single mode:
- agent: "${agent}"
- task: "${taskTpl.replace("{output}", "{result from previous step}")}"
${i > 0 ? "- Pass the output from Step " + i + " as context" : "- Use the user's input as the task"}`;
  });

  return `---
description: "${workflow.name} — ${workflow.description}"
---
# Pipeline: ${workflow.name}

${workflow.description}

Execute the following steps in order:

${steps.join("\n\n")}

## Notes
- Each step receives the output of the previous step
- If any step fails, stop and report the error
- Orchestrator model: ${modelLabel(workflow.orchestrator.model)}
`;
}

export default function PipelinePublishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [format, setFormat] = useState<"chain" | "parallel" | "sequential">("chain");
  const [preview, setPreview] = useState("");
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publishPath, setPublishPath] = useState("");

  useEffect(() => {
    fetch(`/api/workflows/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setWorkflow(data);
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [id]);

  // Regenerate preview when workflow or format changes
  useEffect(() => {
    if (workflow) {
      setPreview(generatePromptContent(workflow, format));
    }
  }, [workflow, format]);

  const handlePublish = async () => {
    if (!workflow) return;
    setPublishing(true);
    setError("");

    try {
      const res = await fetch(`/api/pipelines/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, content: preview }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to publish");
      } else {
        setPublished(true);
        setPublishPath(data.path || "");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPublishing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([preview], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline-${workflow?.name?.replace(/\s+/g, "-").toLowerCase() || id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          Pipeline not found
        </div>
      </div>
    );
  }

  const chain = buildChainOrder(workflow);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/pipelines">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Publish Pipeline
          </h2>
          <p className="text-sm text-muted-foreground">
            {workflow.name} — Generate and deploy as a Pi Agent prompt
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      {published && (
        <div className="bg-green-500/10 text-green-600 rounded-md p-4 flex items-start gap-3">
          <Check className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Pipeline published successfully!</div>
            <p className="text-sm mt-1 opacity-80">
              Prompt file saved to: <code className="bg-green-500/10 px-1.5 py-0.5 rounded text-xs font-mono">{publishPath}</code>
            </p>
            <p className="text-sm mt-1 opacity-80">
              You can now use it with: <code className="bg-green-500/10 px-1.5 py-0.5 rounded text-xs font-mono">pi /workflow-{id}</code>
            </p>
          </div>
        </div>
      )}

      {/* Pipeline overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Pipeline Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            {chain.map((agent, i) => {
              const link = i > 0 ? workflow.links.find((l) => l.targetAgent === agent) : null;
              return (
                <div key={agent} className="flex items-center gap-2">
                  {i > 0 && (
                    <div className="flex items-center gap-1">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      {link && (
                        <span className="text-[10px]">
                          {link.trigger.type === "cron" ? (
                            <span className="text-blue-500 flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                            </span>
                          ) : (
                            <span className="text-amber-500 flex items-center gap-0.5">
                              <Zap className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                  <Badge
                    variant="outline"
                    className="capitalize py-1 px-2.5 gap-1.5"
                    style={{
                      borderColor: `${AGENT_COLORS[agent] || "#6366f1"}50`,
                      backgroundColor: `${AGENT_COLORS[agent] || "#6366f1"}08`,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: AGENT_COLORS[agent] || "#6366f1" }}
                    />
                    {agent.replace(/-/g, " ")}
                  </Badge>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span>{workflow.agents.length} agents</span>
            <span>{workflow.links.length} links</span>
            <span>Orchestrator: {modelLabel(workflow.orchestrator.model)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Format selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execution Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <FormatOption
              id="chain"
              label="Chain"
              description="Sequential with {previous} passing"
              icon="🔗"
              selected={format === "chain"}
              onClick={() => setFormat("chain")}
            />
            <FormatOption
              id="sequential"
              label="Sequential"
              description="Step-by-step with detailed instructions"
              icon="📋"
              selected={format === "sequential"}
              onClick={() => setFormat("sequential")}
            />
            <FormatOption
              id="parallel"
              label="Parallel"
              description="All agents run simultaneously"
              icon="⚡"
              selected={format === "parallel"}
              onClick={() => setFormat("parallel")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Prompt Preview
          </CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDownload}>
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            className="min-h-[300px] font-mono text-xs leading-relaxed"
          />
          <p className="text-[11px] text-muted-foreground mt-2">
            You can edit the prompt before publishing. Changes are preserved.
          </p>
        </CardContent>
      </Card>

      {/* Publish actions */}
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="h-4 w-4" />
            <span>Publishes to <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">~/.pi/agent/prompts/</code></span>
          </div>
          <div className="flex gap-2">
            {published && (
              <Button
                variant="outline"
                onClick={() => {
                  setPublished(false);
                  handlePublish();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Re-publish
              </Button>
            )}
            {!published && (
              <Button onClick={handlePublish} disabled={publishing || !preview.trim()}>
                <Upload className="h-4 w-4 mr-2" />
                {publishing ? "Publishing..." : "Publish Pipeline"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Format Option Card
// ============================================================

function FormatOption({
  id,
  label,
  description,
  icon,
  selected,
  onClick,
}: {
  id: string;
  label: string;
  description: string;
  icon: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`border rounded-lg p-3 text-left transition-all ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border hover:bg-muted/50"
      }`}
    >
      <div className="text-lg mb-1">{icon}</div>
      <div className="font-medium text-sm">{label}</div>
      <div className="text-[11px] text-muted-foreground">{description}</div>
    </button>
  );
}
