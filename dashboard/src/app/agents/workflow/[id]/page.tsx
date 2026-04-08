"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AGENT_COLORS, AVAILABLE_MODELS } from "@/lib/constants";
import {
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  Settings,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Clock,
  Zap,
  Play,
  Link2,
} from "lucide-react";
import Link from "next/link";
import { usePolling } from "@/hooks/use-polling";
import type { Workflow, AgentConfig, AgentLink } from "@/lib/types";

const MODEL_DOT_COLORS: Record<string, string> = {
  "claude-opus-4-6": "#7c3aed",
  "claude-sonnet-4-6": "#2563eb",
  "claude-haiku-4-5": "#059669",
  "qwen2.5-coder:7b": "#d97706",
};

function modelLabel(model: string): string {
  if (model.includes("opus")) return "Claude Opus";
  if (model.includes("sonnet")) return "Claude Sonnet";
  if (model.includes("haiku")) return "Claude Haiku";
  if (model.includes("qwen")) return "Qwen 7B";
  return model;
}

export default function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const isNew = id === "new";
  const router = useRouter();

  const { data: agData } = usePolling<{ agents: AgentConfig[] }>("/api/agents");
  const allAgents = agData?.agents || [];

  const [form, setForm] = useState<Workflow>({
    id: `wf-${Date.now()}`,
    name: "",
    description: "",
    orchestrator: {
      model: "claude-opus-4-6",
      thinkingLevel: "medium",
      systemPrompt: "",
    },
    agents: [],
    links: [],
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isNew) {
      fetch(`/api/workflows/${id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setError(data.error);
          else setForm(data);
        });
    }
  }, [id, isNew]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const url = isNew ? "/api/workflows" : `/api/workflows/${id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }
      router.push("/agents");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = (name: string) => {
    setForm((prev) => {
      const agents = prev.agents.includes(name)
        ? prev.agents.filter((a) => a !== name)
        : [...prev.agents, name];
      // Remove links referencing removed agents
      const links = prev.links.filter(
        (l) => agents.includes(l.sourceAgent) && agents.includes(l.targetAgent)
      );
      return { ...prev, agents, links };
    });
  };

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const moveAgent = (index: number, direction: "up" | "down") => {
    setForm((prev) => {
      const agents = [...prev.agents];
      const swapIdx = direction === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= agents.length) return prev;
      [agents[index], agents[swapIdx]] = [agents[swapIdx], agents[index]];
      return { ...prev, agents };
    });
  };

  const handleDragStart = (index: number) => {
    setDragIdx(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIdx(index);
  };

  const handleDrop = (index: number) => {
    if (dragIdx === null || dragIdx === index) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    setForm((prev) => {
      const agents = [...prev.agents];
      const [moved] = agents.splice(dragIdx, 1);
      agents.splice(index, 0, moved);
      return { ...prev, agents };
    });
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const addLink = () => {
    if (form.agents.length < 2) return;
    const newLink: AgentLink = {
      id: `lnk-${Date.now()}`,
      sourceAgent: form.agents[0],
      targetAgent: form.agents[1],
      trigger: { type: "event" },
      taskTemplate: "Process the following output:\n\n{output}",
      enabled: true,
    };
    setForm((prev) => ({ ...prev, links: [...prev.links, newLink] }));
  };

  const updateLink = (index: number, updates: Partial<AgentLink>) => {
    setForm((prev) => ({
      ...prev,
      links: prev.links.map((l, i) => (i === index ? { ...l, ...updates } : l)),
    }));
  };

  const removeLink = (index: number) => {
    setForm((prev) => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/agents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <h2 className="text-2xl font-bold">
          {isNew ? "Create Workflow" : form.name || "Edit Workflow"}
        </h2>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Video Pipeline"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Generate and publish videos automatically"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orchestrator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Orchestrator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <Select
                value={form.orchestrator.model}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    orchestrator: { ...prev.orchestrator, model: v ?? prev.orchestrator.model },
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Thinking Level</label>
              <Select
                value={form.orchestrator.thinkingLevel}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    orchestrator: { ...prev.orchestrator, thinkingLevel: v ?? prev.orchestrator.thinkingLevel },
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["off", "low", "medium", "high"].map((l) => (
                    <SelectItem key={l} value={l}>
                      {l.charAt(0).toUpperCase() + l.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">System Prompt</label>
            <Textarea
              value={form.orchestrator.systemPrompt}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  orchestrator: { ...prev.orchestrator, systemPrompt: e.target.value },
                }))
              }
              placeholder="Instructions for the orchestrator of this workflow..."
              className="min-h-[150px] font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Agents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agents in this workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {allAgents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents found. Create agents first.</p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {allAgents.map((agent) => {
                const selected = form.agents.includes(agent.name);
                return (
                  <button
                    key={agent.name}
                    onClick={() => toggleAgent(agent.name)}
                    className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: AGENT_COLORS[agent.name] || "#6366f1",
                      }}
                    />
                    {agent.name.replace(/-/g, " ")}
                    <span className="text-xs opacity-60">
                      {modelLabel(agent.model)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Ordered agent list with drag & drop + arrow buttons */}
          {form.agents.length > 0 && (
            <div className="pt-3">
              <Separator className="mb-3" />
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Execution order — drag to reorder
              </label>
              <div className="space-y-1">
                {form.agents.map((name, i) => (
                  <div
                    key={name}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-grab active:cursor-grabbing transition-all ${
                      dragIdx === i ? "opacity-40 scale-95" : ""
                    } ${
                      dragOverIdx === i && dragIdx !== i
                        ? "border-primary ring-1 ring-primary/30"
                        : ""
                    }`}
                    style={{
                      borderColor:
                        dragOverIdx === i && dragIdx !== i
                          ? undefined
                          : `${AGENT_COLORS[name] || "#6366f1"}30`,
                      backgroundColor: `${AGENT_COLORS[name] || "#6366f1"}06`,
                    }}
                  >
                    {/* Drag handle */}
                    <span className="text-muted-foreground cursor-grab select-none">⠿</span>
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: AGENT_COLORS[name] || "#6366f1" }}
                    />
                    <span className="flex-1 capitalize">{name.replace(/-/g, " ")}</span>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => moveAgent(i, "up")}
                        disabled={i === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-20 transition-colors"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => moveAgent(i, "down")}
                        disabled={i === form.agents.length - 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-20 transition-colors"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Links / Pipelines */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Pipeline Links
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={addLink}
            disabled={form.agents.length < 2}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Link
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.links.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No links yet. Add links to define how agents pass data to each other.
            </p>
          ) : (
            form.links.map((link, i) => (
              <div key={link.id} className="border rounded-lg p-3 space-y-3 relative">
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 text-destructive"
                  onClick={() => removeLink(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>

                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Source</label>
                    <Select
                      value={link.sourceAgent}
                      onValueChange={(v) =>
                        updateLink(i, { sourceAgent: v ?? link.sourceAgent })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {form.agents.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground mb-1" />
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Target</label>
                    <Select
                      value={link.targetAgent}
                      onValueChange={(v) =>
                        updateLink(i, { targetAgent: v ?? link.targetAgent })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {form.agents
                          .filter((a) => a !== link.sourceAgent)
                          .map((a) => (
                            <SelectItem key={a} value={a}>
                              {a}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={link.trigger.type === "event"}
                      onCheckedChange={() =>
                        updateLink(i, { trigger: { type: "event" } })
                      }
                    />
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    On output
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={link.trigger.type === "cron"}
                      onCheckedChange={() =>
                        updateLink(i, {
                          trigger: {
                            type: "cron",
                            cronExpression: link.trigger.cronExpression || "0 * * * *",
                          },
                        })
                      }
                    />
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    Cron
                  </label>
                  {link.trigger.type === "cron" && (
                    <Input
                      value={link.trigger.cronExpression || ""}
                      onChange={(e) =>
                        updateLink(i, {
                          trigger: { type: "cron", cronExpression: e.target.value },
                        })
                      }
                      placeholder="0 * * * *"
                      className="h-8 w-32 font-mono text-xs"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Task template <span className="text-muted-foreground font-normal">({"{output}"} = source output)</span>
                  </label>
                  <Textarea
                    value={link.taskTemplate}
                    onChange={(e) => updateLink(i, { taskTemplate: e.target.value })}
                    className="min-h-[60px] font-mono text-xs"
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Scheduled Execution
          </CardTitle>
          <Checkbox
            checked={form.schedule?.enabled || false}
            onCheckedChange={(checked) =>
              setForm((prev) => ({
                ...prev,
                schedule: {
                  enabled: !!checked,
                  cronExpression: prev.schedule?.cronExpression || "0 14 * * *",
                  timezone: prev.schedule?.timezone || "Europe/Paris",
                  task: prev.schedule?.task || "Generate and publish next daily video",
                },
              }))
            }
          />
        </CardHeader>
        {form.schedule?.enabled && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Time (24h)</label>
                <div className="flex gap-2">
                  <Select
                    value={form.schedule?.cronExpression?.split(" ")[1] || "14"}
                    onValueChange={(h) =>
                      setForm((prev) => ({
                        ...prev,
                        schedule: {
                          ...prev.schedule!,
                          cronExpression: `${prev.schedule?.cronExpression?.split(" ")[0] || "0"} ${h} * * *`,
                        },
                      }))
                    }
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {String(i).padStart(2, "0")}h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.schedule?.cronExpression?.split(" ")[0] || "0"}
                    onValueChange={(m) =>
                      setForm((prev) => ({
                        ...prev,
                        schedule: {
                          ...prev.schedule!,
                          cronExpression: `${m} ${prev.schedule?.cronExpression?.split(" ")[1] || "14"} * * *`,
                        },
                      }))
                    }
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 45].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          :{String(m).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Timezone</label>
                <Select
                  value={form.schedule?.timezone || "Europe/Paris"}
                  onValueChange={(tz) =>
                    setForm((prev) => ({
                      ...prev,
                      schedule: { ...prev.schedule!, timezone: tz ?? prev.schedule!.timezone },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Task prompt</label>
              <Input
                value={form.schedule?.task || ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    schedule: { ...prev.schedule!, task: e.target.value },
                  }))
                }
                placeholder="What should the workflow do each run?"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Cron: <code className="bg-muted px-1 rounded">{form.schedule?.cronExpression}</code>
              {form.schedule?.lastRunAt && (
                <span> | Last run: {new Date(form.schedule.lastRunAt).toLocaleString()}</span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Save */}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving || !form.name}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : isNew ? "Create Workflow" : "Save Workflow"}
        </Button>
        <Link href="/agents">
          <Button variant="outline">Cancel</Button>
        </Link>
      </div>
    </div>
  );
}
