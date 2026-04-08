import fs from "fs";
import path from "path";
import os from "os";
import type {
  JournalEvent,
  SessionSummary,
  MessageEvent,
  AssistantMessage,
  ToolResultMessage,
} from "./types";

function getSessionsDir(): string {
  return (
    process.env.SESSIONS_DIR ||
    path.join(os.homedir(), ".pi", "agent", "sessions")
  );
}

export function getAgentsDir(): string {
  return (
    process.env.AGENTS_DIR ||
    path.join(os.homedir(), ".pi", "agent", "agents")
  );
}

/**
 * List all workspace folders inside the sessions directory.
 */
export function listWorkspaces(): { folder: string; displayName: string }[] {
  const dir = getSessionsDir();
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      folder: d.name,
      displayName: decodeWorkspaceName(d.name),
    }));
}

/**
 * Decode workspace folder names back to readable paths.
 * Pattern: leading/trailing `--` for drive root, internal `--` for separators.
 */
function decodeWorkspaceName(name: string): string {
  // Remove leading/trailing --
  let decoded = name.replace(/^--/, "").replace(/--$/, "");
  // Replace remaining -- with path separator hints
  decoded = decoded.replace(/--/g, ":\\");
  // Replace single - with space or backslash (heuristic)
  // Actually the cwd from the session event is more reliable
  return decoded;
}

/**
 * List all session files across all workspaces, sorted by timestamp desc.
 */
export function listSessionFiles(): {
  filePath: string;
  workspace: string;
  timestamp: string;
  uuid: string;
}[] {
  const dir = getSessionsDir();
  if (!fs.existsSync(dir)) return [];

  const results: {
    filePath: string;
    workspace: string;
    timestamp: string;
    uuid: string;
  }[] = [];

  const workspaces = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const ws of workspaces) {
    const wsPath = path.join(dir, ws.name);
    const files = fs
      .readdirSync(wsPath)
      .filter((f) => f.endsWith(".jsonl"));

    for (const file of files) {
      // filename pattern: 2026-03-30T20-54-08-958Z_faf027c3-b137-42d3-8745-20c54281a553.jsonl
      const match = file.match(
        /^(.+?)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/
      );
      if (match) {
        results.push({
          filePath: path.join(wsPath, file),
          workspace: ws.name,
          timestamp: match[1].replace(/-(\d{3})Z/, ".$1Z").replace(/-/g, ":").replace(/T([\d:]+)/, (_, t) => `T${t}`),
          uuid: match[2],
        });
      }
    }
  }

  // Sort by timestamp descending
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return results;
}

/**
 * Parse a JSONL session file into typed events.
 */
export function parseSessionFile(filePath: string): JournalEvent[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  const events: JournalEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as JournalEvent);
    } catch {
      // Skip malformed lines
    }
  }
  return events;
}

/**
 * Compute a summary from parsed session events.
 */
export function computeSessionSummary(
  events: JournalEvent[],
  uuid: string,
  workspace: string
): SessionSummary {
  let cwd = "";
  let firstTimestamp = "";
  let lastTimestamp = "";
  let totalCost = 0;
  let totalTokens = 0;
  let messageCount = 0;
  let toolCalls = 0;
  let errors = 0;
  const models = new Set<string>();
  const agents = new Set<string>();

  for (const event of events) {
    if (!firstTimestamp) firstTimestamp = event.timestamp;
    lastTimestamp = event.timestamp;

    if (event.type === "session") {
      cwd = event.cwd;
    } else if (event.type === "model_change") {
      models.add(event.modelId);
    } else if (event.type === "message") {
      const msg = event.message;

      if (msg.role === "user" || msg.role === "assistant") {
        messageCount++;
      }

      if (msg.role === "assistant") {
        const assistant = msg as AssistantMessage;
        if (assistant.usage) {
          totalCost += assistant.usage.cost.total;
          totalTokens += assistant.usage.totalTokens;
        }
        models.add(assistant.model);

        // Count tool calls in content
        for (const block of assistant.content) {
          if (block.type === "toolCall") {
            toolCalls++;
          }
        }
      }

      if (msg.role === "toolResult") {
        const tr = msg as ToolResultMessage;
        if (tr.isError) errors++;

        // Extract subagent data
        if (tr.details?.results) {
          for (const result of tr.details.results) {
            agents.add(result.agent);
            if (result.usage) {
              totalCost += result.usage.cost;
              totalTokens += result.usage.contextTokens || 0;
            }
            if (result.exitCode !== 0) errors++;
          }
        }
      }
    }
  }

  const duration =
    firstTimestamp && lastTimestamp
      ? new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime()
      : 0;

  return {
    id: uuid,
    timestamp: firstTimestamp,
    cwd,
    workspace,
    duration,
    messageCount,
    totalCost,
    totalTokens,
    models: Array.from(models),
    agents: Array.from(agents),
    toolCalls,
    errors,
  };
}

/**
 * Get all session summaries.
 */
export function getAllSessionSummaries(): SessionSummary[] {
  const files = listSessionFiles();
  return files.map((f) => {
    const events = parseSessionFile(f.filePath);
    return computeSessionSummary(events, f.uuid, f.workspace);
  });
}

/**
 * Get full session events by UUID.
 */
export function getSessionById(uuid: string): {
  events: JournalEvent[];
  summary: SessionSummary;
} | null {
  const files = listSessionFiles();
  const file = files.find((f) => f.uuid === uuid);
  if (!file) return null;

  const events = parseSessionFile(file.filePath);
  const summary = computeSessionSummary(events, uuid, file.workspace);
  return { events, summary };
}

/**
 * Find a session file by UUID across all workspaces.
 */
export function findSessionFile(uuid: string): string | null {
  const files = listSessionFiles();
  const file = files.find((f) => f.uuid === uuid);
  return file?.filePath || null;
}
