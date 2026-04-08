"use client";

import { use, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Square, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import type { RunStatus } from "@/lib/runner";

export default function AgentRunPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const [task, setTask] = useState("");
  const [cwd, setCwd] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load agent info and pre-fill task
  useEffect(() => {
    fetch(`/api/agents/${name}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.description) {
          setTask(`Execute your mission: ${data.description}`);
        }
      })
      .catch(() => {});
  }, [name]);

  // Check if there's already a running process for this agent
  useEffect(() => {
    fetch(`/api/runs?agent=${name}`)
      .then((r) => r.json())
      .then((data) => {
        const activeRun = data.runs?.find(
          (r: RunStatus) => r.status === "running"
        );
        if (activeRun) {
          setRunId(activeRun.runId);
          setRunning(true);
          setOutput(activeRun.output || []);
          // Start polling for updates
          pollRunStatus(activeRun.runId);
        }
      })
      .catch(() => {});
  }, [name]);

  // Auto-scroll output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const pollRunStatus = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${id}`);
        const data: RunStatus = await res.json();
        setOutput(data.output || []);

        if (data.status !== "running") {
          setRunning(false);
          setExitCode(data.exitCode ?? null);
          if (data.startedAt && data.endedAt) {
            setDuration(data.endedAt - data.startedAt);
          }
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  };

  const handleRun = async () => {
    if (!task.trim()) return;

    setRunning(true);
    setOutput([]);
    setExitCode(null);
    setDuration(null);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: name, task, cwd: cwd || undefined }),
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
            // skip parse errors
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
    await fetch("/api/run", {
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
          Run: <span className="text-primary">{name.replace(/-/g, " ")}</span>
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
        {duration !== null && (
          <span className="text-xs text-muted-foreground">
            {(duration / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Task</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe what this agent should do..."
            className="min-h-[100px] font-mono text-sm"
            disabled={running}
          />
          <div className="flex gap-3 items-center">
            <Input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="Working directory (optional)"
              className="flex-1"
              disabled={running}
            />
            {running ? (
              <Button variant="destructive" onClick={handleStop}>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button onClick={handleRun} disabled={!task.trim()}>
                <Play className="h-4 w-4 mr-2" />
                Run
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
