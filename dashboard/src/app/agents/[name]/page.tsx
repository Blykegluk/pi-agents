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
import { AVAILABLE_MODELS, AVAILABLE_TOOLS } from "@/lib/constants";
import { Save, ArrowLeft, Plus, Trash2, Globe } from "lucide-react";
import Link from "next/link";
import type { ApiConfig, ApiEndpoint } from "@/lib/types";

interface AgentFormData {
  name: string;
  description: string;
  model: string;
  tools: string[];
  systemPrompt: string;
}

const emptyApi: ApiConfig = {
  id: "",
  name: "",
  baseUrl: "",
  authType: "api-key",
  authHeader: "X-API-Key",
  authEnvVar: "",
  endpoints: [],
};

const emptyEndpoint: ApiEndpoint = {
  name: "",
  method: "POST",
  path: "",
  description: "",
};

export default function AgentEditPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const router = useRouter();
  const isNew = name === "new";

  const [form, setForm] = useState<AgentFormData>({
    name: "",
    description: "",
    model: "claude-opus-4-6",
    tools: ["read", "grep", "find", "ls"],
    systemPrompt: "",
  });
  const [apis, setApis] = useState<ApiConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isNew) {
      fetch(`/api/agents/${name}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
          } else {
            setForm({
              name: data.name,
              description: data.description,
              model: data.model,
              tools: data.tools,
              systemPrompt: data.systemPrompt,
            });
          }
        });

      // Load APIs for this agent
      fetch(`/api/apis?agent=${name}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.apis) setApis(data.apis);
        });
    }
  }, [name, isNew]);

  const handleSave = async () => {
    setSaving(true);
    setError("");

    try {
      // Save agent
      const url = isNew ? "/api/agents" : `/api/agents/${name}`;
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

      // Save all APIs for this agent (replace entire list)
      const agentName = form.name || name;
      const apisToSave = apis.map((api) => ({
        ...api,
        id: api.id || `api-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }));
      await fetch("/api/apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName, apis: apisToSave }),
      });

      router.push("/agents");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleTool = (tool: string) => {
    setForm((prev) => ({
      ...prev,
      tools: prev.tools.includes(tool)
        ? prev.tools.filter((t) => t !== tool)
        : [...prev.tools, tool],
    }));
  };

  const addApi = () => {
    setApis((prev) => [...prev, { ...emptyApi }]);
  };

  const removeApi = (index: number) => {
    setApis((prev) => prev.filter((_, i) => i !== index));
  };

  const updateApi = (index: number, updates: Partial<ApiConfig>) => {
    setApis((prev) =>
      prev.map((api, i) => (i === index ? { ...api, ...updates } : api))
    );
  };

  const addEndpoint = (apiIndex: number) => {
    setApis((prev) =>
      prev.map((api, i) =>
        i === apiIndex
          ? { ...api, endpoints: [...api.endpoints, { ...emptyEndpoint }] }
          : api
      )
    );
  };

  const removeEndpoint = (apiIndex: number, epIndex: number) => {
    setApis((prev) =>
      prev.map((api, i) =>
        i === apiIndex
          ? { ...api, endpoints: api.endpoints.filter((_, j) => j !== epIndex) }
          : api
      )
    );
  };

  const updateEndpoint = (
    apiIndex: number,
    epIndex: number,
    updates: Partial<ApiEndpoint>
  ) => {
    setApis((prev) =>
      prev.map((api, i) =>
        i === apiIndex
          ? {
              ...api,
              endpoints: api.endpoints.map((ep, j) =>
                j === epIndex ? { ...ep, ...updates } : ep
              ),
            }
          : api
      )
    );
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
          {isNew ? "Create Agent" : `Edit: ${name}`}
        </h2>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      {/* Agent Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent Configuration</CardTitle>
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
                placeholder="my-agent"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <Select
                value={form.model}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, model: v ?? "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                      <span className="text-muted-foreground ml-2 text-xs">
                        ({m.provider})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="What does this agent do?"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Allowed Tools</label>
            <div className="flex gap-3 flex-wrap">
              {AVAILABLE_TOOLS.map((tool) => (
                <label
                  key={tool}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={form.tools.includes(tool)}
                    onCheckedChange={() => toggleTool(tool)}
                  />
                  <Badge variant="outline" className="text-xs">
                    {tool}
                  </Badge>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">System Prompt</label>
            <Textarea
              value={form.systemPrompt}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, systemPrompt: e.target.value }))
              }
              placeholder="You are a specialized agent that..."
              className="min-h-[300px] font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* External APIs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            External APIs
          </CardTitle>
          <Button size="sm" variant="outline" onClick={addApi}>
            <Plus className="h-3 w-3 mr-1" />
            Add API
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {apis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No APIs configured. Add an API (MiniMax, ElevenLabs, etc.) to give
              this agent access to external services via curl.
            </p>
          ) : (
            apis.map((api, apiIdx) => (
              <div
                key={apiIdx}
                className="border rounded-lg p-4 space-y-3 relative"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 text-destructive"
                  onClick={() => removeApi(apiIdx)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">API Name</label>
                    <Input
                      value={api.name}
                      onChange={(e) =>
                        updateApi(apiIdx, { name: e.target.value })
                      }
                      placeholder="MiniMax Video"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Base URL</label>
                    <Input
                      value={api.baseUrl}
                      onChange={(e) =>
                        updateApi(apiIdx, { baseUrl: e.target.value })
                      }
                      placeholder="https://api.minimax.chat/v1"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Auth Type</label>
                    <Select
                      value={api.authType}
                      onValueChange={(v) =>
                        updateApi(apiIdx, {
                          authType: (v as ApiConfig["authType"]) ?? "none",
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="api-key">API Key</SelectItem>
                        <SelectItem value="bearer">Bearer Token</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      Env Variable Name
                    </label>
                    <Input
                      value={api.authEnvVar || ""}
                      onChange={(e) =>
                        updateApi(apiIdx, { authEnvVar: e.target.value })
                      }
                      placeholder="MINIMAX_API_KEY"
                      className="h-8 text-sm"
                      disabled={api.authType === "none"}
                    />
                  </div>
                </div>
                {api.authType !== "none" && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium">
                      API Key
                    </label>
                    <Input
                      type="password"
                      value={api.apiKey || ""}
                      onChange={(e) =>
                        updateApi(apiIdx, { apiKey: e.target.value })
                      }
                      placeholder="sk-..."
                      className="h-8 text-sm font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Stored locally. Passed as ${api.authEnvVar || "ENV_VAR"} to the agent at runtime.
                    </p>
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">Endpoints</label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => addEndpoint(apiIdx)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                  {api.endpoints.map((ep, epIdx) => (
                    <div
                      key={epIdx}
                      className="grid grid-cols-[80px_1fr_1fr_auto] gap-2 items-center"
                    >
                      <Select
                        value={ep.method}
                        onValueChange={(v) =>
                          updateEndpoint(apiIdx, epIdx, {
                            method: (v as ApiEndpoint["method"]) ?? "GET",
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["GET", "POST", "PUT", "DELETE", "PATCH"].map(
                            (m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                      <Input
                        value={ep.path}
                        onChange={(e) =>
                          updateEndpoint(apiIdx, epIdx, {
                            path: e.target.value,
                          })
                        }
                        placeholder="/generate-video"
                        className="h-7 text-xs"
                      />
                      <Input
                        value={ep.description}
                        onChange={(e) =>
                          updateEndpoint(apiIdx, epIdx, {
                            description: e.target.value,
                          })
                        }
                        placeholder="Generate a video"
                        className="h-7 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => removeEndpoint(apiIdx, epIdx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Save / Delete */}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Agent"}
        </Button>
        <Link href="/agents">
          <Button variant="outline">Cancel</Button>
        </Link>
        {!isNew && (
          <Button
            variant="destructive"
            className="ml-auto"
            onClick={async () => {
              if (!confirm(`Delete agent "${name}"? This cannot be undone.`)) return;
              await fetch(`/api/agents/${name}`, { method: "DELETE" });
              router.push("/agents");
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Agent
          </Button>
        )}
      </div>

      {/* Markdown Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Markdown Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs font-mono bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre-wrap">
            {`---\nname: ${form.name}\ndescription: ${form.description}\ntools: ${form.tools.join(", ")}\n${form.model ? `model: ${form.model}\n` : ""}---\n\n${form.systemPrompt}`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
