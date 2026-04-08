"use client";

import { use, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Square, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import type { Workflow } from "@/lib/types";

export default function WorkflowRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [task, setTask] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load workflow info
  useEffect(() => {
    fetch(`/api/workflows/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setWorkflow(data);
          setTask(`Execute the full pipeline: ${data.description}`);
        }
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const handleRun = async () => {
    if (!task.trim()) return;

    setRunning(true);
    setOutput([]);
    setExitCode(null);

    try {
      const res = await fetch(`/api/workflows/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === "started") {
              setRunId(json.runId);
            } else if (json.type === "output") {
              setOutput((prev) => [...prev, json.data]);
            } else if (json.type === "done") {
              setExitCode(json.exitCode);
              setRunning(false);
            } else if (json.type === "error") {
              setOutput((prev) => [...prev, `ERROR: ${json.error}`]);
              setRunning(false);
            }
          } catch {
            // skip
          }
        }
      }
    } catch (e) {
      setOutput((prev) => [...prev, `Connection error: ${e}`]);
      setRunning(false);
    }
  };

  const handleStop = async () => {
    if (!runId) return;
    await fetch(`/api/workflows/${id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop", runId }),
    });
    setRunning(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/agents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <h2 className="text-2xl font-bold">
          Run: <span className="text-primary">{workflow?.name || "Workflow"}</span>
        </h2>
        {running && (
          <Badge variant="default" className="animate-pulse flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running
          </Badge>
        )}
        {exitCode !== null && (
          <Badge variant={exitCode === 0 ? "secondary" : "destructive"}>
            Exit: {exitCode}
          </Badge>
        )}
      </div>

      {/* Pipeline overview */}
      {workflow && (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-muted-foreground">Pipeline:</span>
          {workflow.agents.map((agent, i) => (
            <span key={agent} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <Badge variant="outline" className="capitalize">
                {agent.replace(/-/g, " ")}
              </Badge>
            </span>
          ))}
        </div>
      )}

      {/* Task input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Task</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="What should the workflow do?"
            className="min-h-[100px] font-mono text-sm"
            disabled={running}
          />
          <div className="flex gap-3">
            {running ? (
              <Button variant="destructive" onClick={handleStop}>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button onClick={handleRun} disabled={!task.trim()}>
                <Play className="h-4 w-4 mr-2" />
                Run Workflow
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Output */}
      {output.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Output</CardTitle>
            {running && (
              <Badge variant="outline" className="text-xs animate-pulse">
                Live
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]" ref={scrollRef}>
              <pre className="text-sm font-mono whitespace-pre-wrap">
                {output.join("")}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
