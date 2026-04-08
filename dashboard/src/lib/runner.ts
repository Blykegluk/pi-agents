import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import type { ApiConfig } from "./types";

/**
 * Load API keys for an agent from apis.json and return as env vars.
 */
function getAgentApiEnvVars(agentName: string): Record<string, string> {
  const apisFile = path.join(os.homedir(), ".pi", "agent", "apis.json");
  if (!fs.existsSync(apisFile)) return {};

  try {
    const allApis = JSON.parse(fs.readFileSync(apisFile, "utf-8"));
    const agentApis: ApiConfig[] = allApis[agentName] || [];
    const envVars: Record<string, string> = {};

    for (const api of agentApis) {
      if (api.apiKey && api.authEnvVar) {
        envVars[api.authEnvVar] = api.apiKey;
      }
    }
    return envVars;
  } catch {
    return {};
  }
}

export interface RunStatus {
  runId: string;
  agent: string;
  status: "running" | "done" | "error";
  exitCode?: number;
  startedAt: number;
  endedAt?: number;
  output: string[];
  error?: string;
}

// Use globalThis to persist across HMR reloads in dev mode
const globalAny = globalThis as unknown as {
  __piActiveProcesses?: Map<string, ChildProcess>;
  __piRunStore?: Map<string, RunStatus>;
};
if (!globalAny.__piActiveProcesses) globalAny.__piActiveProcesses = new Map();
if (!globalAny.__piRunStore) globalAny.__piRunStore = new Map();

const activeProcesses = globalAny.__piActiveProcesses;
const runStore = globalAny.__piRunStore;

/**
 * Get all runs (active and recent).
 */
export function getAllRuns(): RunStatus[] {
  return Array.from(runStore.values()).sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Get runs for a specific agent.
 */
export function getRunsForAgent(agent: string): RunStatus[] {
  return getAllRuns().filter((r) => r.agent === agent);
}

/**
 * Get a specific run by ID.
 */
export function getRun(runId: string): RunStatus | null {
  return runStore.get(runId) || null;
}

/**
 * Run a Pi Agent via the `pi` CLI and stream output.
 */
export function runAgent(opts: {
  agent: string;
  task: string;
  cwd?: string;
  onData: (data: string) => void;
  onDone: (exitCode: number) => void;
  onError: (error: string) => void;
}): string {
  const runId = `${opts.agent}-${Date.now()}`;

  // Create run status entry
  const runStatus: RunStatus = {
    runId,
    agent: opts.agent,
    status: "running",
    startedAt: Date.now(),
    output: [],
  };
  runStore.set(runId, runStatus);

  // Clean up old completed runs (keep last 20)
  const allRuns = Array.from(runStore.entries());
  if (allRuns.length > 20) {
    const completed = allRuns
      .filter(([, r]) => r.status !== "running")
      .sort(([, a], [, b]) => a.startedAt - b.startedAt);
    for (let i = 0; i < completed.length - 10; i++) {
      runStore.delete(completed[i][0]);
    }
  }

  // Read agent config to get model and system prompt
  const agentsDir = process.env.AGENTS_DIR || path.join(os.homedir(), ".pi", "agent", "agents");
  const agentFile = path.join(agentsDir, `${opts.agent}.md`);

  const args = ["--print", "--no-session", "--no-extensions"];

  if (fs.existsSync(agentFile)) {
    const content = fs.readFileSync(agentFile, "utf-8");

    // Parse frontmatter for model and tools
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (fmMatch) {
      const frontmatter = fmMatch[1];
      const systemPrompt = fmMatch[2].trim();

      // Extract model
      const modelMatch = frontmatter.match(/^model:\s*(.+)$/m);
      if (modelMatch) {
        args.push("--model", modelMatch[1].trim());
      }

      // Extract tools
      const toolsMatch = frontmatter.match(/^tools:\s*(.+)$/m);
      if (toolsMatch && toolsMatch[1].trim()) {
        args.push("--tools", toolsMatch[1].trim().replace(/\s/g, ""));
      }

      // Write system prompt to temp file to avoid shell escaping issues
      if (systemPrompt) {
        const tmpDir = "/tmp/pi-dashboard";
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const promptFile = `${tmpDir}/p-${Date.now()}.md`;
        fs.writeFileSync(promptFile, systemPrompt, "utf-8");
        args.push("--append-system-prompt", promptFile);
      }
    }
  }

  // Load API keys for this agent
  const apiEnvVars = getAgentApiEnvVars(opts.agent);

  // Pass task via stdin (pi hangs when task is passed as arg without TTY)
  const child = spawn("pi", args, {
    cwd: opts.cwd || process.cwd(),
    shell: true,
    env: { ...process.env, ...apiEnvVars },
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (child.stdin) {
    child.stdin.write(opts.task);
    child.stdin.end();
  }

  activeProcesses.set(runId, child);

  child.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    runStatus.output.push(text);
    opts.onData(text);
  });

  child.stderr?.on("data", (data: Buffer) => {
    const text = `[stderr] ${data.toString()}`;
    runStatus.output.push(text);
    opts.onData(text);
  });

  child.on("close", (code: number | null) => {
    activeProcesses.delete(runId);
    runStatus.status = "done";
    runStatus.exitCode = code ?? 1;
    runStatus.endedAt = Date.now();
    opts.onDone(code ?? 1);
  });

  child.on("error", (err: Error) => {
    activeProcesses.delete(runId);
    runStatus.status = "error";
    runStatus.error = err.message;
    runStatus.endedAt = Date.now();
    opts.onError(err.message);
  });

  return runId;
}

/**
 * Run a full workflow: executes agents sequentially, passing output between them.
 * Each agent runs as a separate pi process. The runner IS the orchestrator.
 */
export function runWorkflow(opts: {
  workflow: { id: string; name: string; orchestrator: { model: string; thinkingLevel: string; systemPrompt: string }; agents: string[]; links: { sourceAgent: string; targetAgent: string; taskTemplate?: string }[] };
  task: string;
  cwd?: string;
  onData: (data: string) => void;
  onDone: (exitCode: number) => void;
  onError: (error: string) => void;
}): string {
  const { workflow } = opts;
  const runId = `workflow-${workflow.id}-${Date.now()}`;

  const runStatus: RunStatus = {
    runId,
    agent: workflow.name,
    status: "running",
    startedAt: Date.now(),
    output: [],
  };
  runStore.set(runId, runStatus);

  // Load all API keys for agents in this workflow
  const allApiEnvVars: Record<string, string> = {};
  for (const agentName of workflow.agents) {
    Object.assign(allApiEnvVars, getAgentApiEnvVars(agentName));
  }

  const agentsDir = process.env.AGENTS_DIR || path.join(os.homedir(), ".pi", "agent", "agents");

  // For the video workflow, after Script-creator (Step 1), run pipeline.sh directly
  // instead of spawning separate pi processes for each agent (pi hangs on long-running tasks)
  const isVideoWorkflow = workflow.agents.includes("video-generator") && workflow.agents.includes("video-editor");
  const pipelineScript = "C:/Users/antho/Documents/1. Projets AI/13. Pi Agents/pipeline.sh";

  // Run agents sequentially
  const runNextAgent = (index: number, previousOutput: string) => {
    if (index >= workflow.agents.length) {
      // All agents done
      const msg = `\n\n--- ✅ Workflow complete! All ${workflow.agents.length} agents finished. ---\n`;
      runStatus.output.push(msg);
      opts.onData(msg);
      runStatus.status = "done";
      runStatus.exitCode = 0;
      runStatus.endedAt = Date.now();
      opts.onDone(0);
      return;
    }

    const agentName = workflow.agents[index];
    const agentFile = path.join(agentsDir, `${agentName}.md`);

    // Announce current agent
    const header = `\n\n--- 🤖 Step ${index + 1}/${workflow.agents.length}: Running **${agentName}** ---\n\n`;
    runStatus.output.push(header);
    opts.onData(header);

    // Build args for this agent
    const args = ["--print", "--no-session", "--no-extensions"];

    if (fs.existsSync(agentFile)) {
      const content = fs.readFileSync(agentFile, "utf-8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (fmMatch) {
        const frontmatter = fmMatch[1];
        const systemPrompt = fmMatch[2].trim();

        const modelMatch = frontmatter.match(/^model:\s*(.+)$/m);
        if (modelMatch) args.push("--model", modelMatch[1].trim());

        const toolsMatch = frontmatter.match(/^tools:\s*(.+)$/m);
        if (toolsMatch && toolsMatch[1].trim()) {
          args.push("--tools", toolsMatch[1].trim().replace(/\s/g, ""));
        }

        if (systemPrompt) {
          const tmpDir = "/tmp/pi-dashboard";
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          const promptFile = `${tmpDir}/p-${index}-${Date.now()}.md`;
          fs.writeFileSync(promptFile, systemPrompt, "utf-8");
          args.push("--append-system-prompt", promptFile);
        }
      }
    }

    // Build the task: first agent gets the user's task, subsequent agents get previous output via link template
    let task: string;
    if (index === 0) {
      task = opts.task + "\n\nIMPORTANT: This is a FULLY AUTOMATED pipeline. Do NOT ask for confirmation, validation, or approval. Do NOT stop and wait. Generate the complete deliverable immediately and output everything in one go.";
    } else {
      // Find the link connecting the previous agent to this one
      const prevAgent = workflow.agents[index - 1];
      const link = workflow.links.find(
        (l) => l.sourceAgent === prevAgent && l.targetAgent === agentName
      );
      if (link?.taskTemplate) {
        task = link.taskTemplate.replace(/\{output\}/g, previousOutput);
      } else {
        task = `Here is the output from the previous agent (${prevAgent}):\n\n${previousOutput}\n\nProcess this and execute your mission.`;
      }
    }

    // Log the command for debugging
    const cmdLog = `> pi ${args.join(" ").substring(0, 300)}...\n`;
    runStatus.output.push(cmdLog);
    opts.onData(cmdLog);

    const child = spawn("pi", args, {
      cwd: opts.cwd || process.cwd(),
      shell: true,
      env: { ...process.env, ...allApiEnvVars },
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (child.stdin) {
      child.stdin.on("error", () => {}); // Ignore EPIPE
      child.stdin.write(task);
      child.stdin.end();
    }

    activeProcesses.set(runId, child);
    let agentOutput = "";

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      agentOutput += text;
      runStatus.output.push(text);
      opts.onData(text);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = `[stderr] ${data.toString()}`;
      runStatus.output.push(text);
      opts.onData(text);
    });

    child.on("close", (code: number | null) => {
      activeProcesses.delete(runId);

      if (code !== 0) {
        const errMsg = `\n\n--- ❌ Agent ${agentName} failed (exit ${code}). Workflow stopped. ---\n`;
        runStatus.output.push(errMsg);
        opts.onData(errMsg);
        runStatus.status = "done";
        runStatus.exitCode = code ?? 1;
        runStatus.endedAt = Date.now();
        opts.onDone(code ?? 1);
        return;
      }

      // After Script-creator (index 0), if this is the video workflow,
      // run pipeline.sh directly instead of spawning pi for each remaining agent
      if (isVideoWorkflow && index === 0) {
        const pipeMsg = `\n\n--- 🚀 Running pipeline.sh for steps 2-5 (generate → edit → publish) ---\n\n`;
        runStatus.output.push(pipeMsg);
        opts.onData(pipeMsg);

        // Write script output to temp file (too long/complex for shell argument)
        // IMPORTANT: Use C:/tmp which is accessible from both Node.js AND MSYS bash
        // Node's /tmp = C:\tmp, but bash's /tmp = C:\Users\antho\AppData\Local\Temp
        const tmpDir = "C:/tmp/pi-dashboard";
        const tmpScriptOutput = `${tmpDir}/script-output-${Date.now()}.txt`;
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(tmpScriptOutput, agentOutput, "utf-8");

        const pipeChild = spawn("bash", [pipelineScript, tmpScriptOutput], {
          cwd: opts.cwd || process.cwd(),
          shell: false,
          env: { ...process.env, ...allApiEnvVars },
          stdio: ["pipe", "pipe", "pipe"],
        });

        activeProcesses.set(runId, pipeChild);

        pipeChild.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          runStatus.output.push(text);
          try { opts.onData(text); } catch {}
        });

        pipeChild.stderr?.on("data", (data: Buffer) => {
          const text = `[stderr] ${data.toString()}`;
          runStatus.output.push(text);
          try { opts.onData(text); } catch {}
        });

        pipeChild.on("close", (pipeCode: number | null) => {
          activeProcesses.delete(runId);
          if (pipeCode === 0) {
            const doneMsg = `\n\n--- ✅ Workflow complete! Pipeline finished successfully. ---\n`;
            runStatus.output.push(doneMsg);
            try { opts.onData(doneMsg); } catch {}
          } else {
            const errMsg = `\n\n--- ❌ Pipeline failed (exit ${pipeCode}). ---\n`;
            runStatus.output.push(errMsg);
            try { opts.onData(errMsg); } catch {}
          }
          runStatus.status = "done";
          runStatus.exitCode = pipeCode ?? 1;
          runStatus.endedAt = Date.now();
          try { opts.onDone(pipeCode ?? 0); } catch {}
        });

        pipeChild.on("error", (err: Error) => {
          activeProcesses.delete(runId);
          const errMsg = `\n\n--- ❌ Pipeline error: ${err.message} ---\n`;
          runStatus.output.push(errMsg);
          try { opts.onData(errMsg); } catch {}
          runStatus.status = "error";
          runStatus.error = err.message;
          runStatus.endedAt = Date.now();
          try { opts.onError(err.message); } catch {}
        });

        return;
      }

      // No validation pause — continue automatically to next agent
      runNextAgent(index + 1, agentOutput);
    });

    child.on("error", (err: Error) => {
      activeProcesses.delete(runId);
      const errMsg = `\n\n--- ❌ Agent ${agentName} error: ${err.message} ---\n`;
      runStatus.output.push(errMsg);
      opts.onData(errMsg);
      runStatus.status = "error";
      runStatus.error = err.message;
      runStatus.endedAt = Date.now();
      opts.onError(err.message);
    });
  };

  // Start with first agent
  runNextAgent(0, "");

  return runId;
}

/**
 * Stop a running agent process.
 */
export function stopAgent(runId: string): boolean {
  const child = activeProcesses.get(runId);
  if (child) {
    child.kill("SIGTERM");
    activeProcesses.delete(runId);
    const status = runStore.get(runId);
    if (status) {
      status.status = "done";
      status.exitCode = -1;
      status.endedAt = Date.now();
    }
    return true;
  }
  return false;
}
