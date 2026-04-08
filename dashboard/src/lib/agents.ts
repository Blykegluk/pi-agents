import fs from "fs";
import path from "path";
import { getAgentsDir } from "./sessions";
import { loadWorkflows } from "./workflows";
import type { AgentConfig, Workflow } from "./types";

const WORKFLOWS_FILE = path.join(
  process.env.PI_CONFIG_DIR || path.join(require("os").homedir(), ".pi", "agent"),
  "workflows.json"
);

/**
 * Update all workflow references when an agent is renamed.
 */
function updateWorkflowReferences(oldName: string, newName: string): void {
  const workflows = loadWorkflows();
  let changed = false;

  for (const wf of workflows) {
    const agentIdx = wf.agents.indexOf(oldName);
    if (agentIdx !== -1) {
      wf.agents[agentIdx] = newName;
      changed = true;
    }
    for (const link of wf.links) {
      if (link.sourceAgent === oldName) {
        link.sourceAgent = newName;
        changed = true;
      }
      if (link.targetAgent === oldName) {
        link.targetAgent = newName;
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(workflows, null, 2), "utf-8");
  }
}

/**
 * Parse a Pi Agent .md file (YAML frontmatter + system prompt body).
 */
function parseAgentFile(filePath: string): AgentConfig | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) return null;

    const frontmatter = fmMatch[1];
    const body = fmMatch[2].trim();

    // Simple YAML parser for flat key-value pairs
    const fm: Record<string, string> = {};
    for (const line of frontmatter.split("\n")) {
      const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
      if (kv) {
        fm[kv[1]] = kv[2].trim();
      }
    }

    return {
      name: fm.name || path.basename(filePath, ".md"),
      description: fm.description || "",
      tools: fm.tools ? fm.tools.split(",").map((t) => t.trim()) : [],
      model: fm.model || "",
      systemPrompt: body,
      filePath,
    };
  } catch {
    return null;
  }
}

/**
 * List all agents from the agents directory.
 */
export function listAgents(): AgentConfig[] {
  const dir = getAgentsDir();
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseAgentFile(path.join(dir, f)))
    .filter((a): a is AgentConfig => a !== null);
}

/**
 * Get a single agent by name.
 */
export function getAgent(name: string): AgentConfig | null {
  const dir = getAgentsDir();
  const filePath = path.join(dir, `${name}.md`);
  if (!fs.existsSync(filePath)) return null;
  return parseAgentFile(filePath);
}

/**
 * Serialize an agent config to Markdown with YAML frontmatter.
 */
function serializeAgent(config: {
  name: string;
  description: string;
  tools: string[];
  model: string;
  systemPrompt: string;
}): string {
  const lines = [
    "---",
    `name: ${config.name}`,
    `description: ${config.description}`,
    `tools: ${config.tools.join(", ")}`,
  ];
  if (config.model) {
    lines.push(`model: ${config.model}`);
  }
  lines.push("---", "", config.systemPrompt);
  return lines.join("\n");
}

/**
 * Create a new agent.
 */
export function createAgent(config: {
  name: string;
  description: string;
  tools: string[];
  model: string;
  systemPrompt: string;
}): AgentConfig {
  const dir = getAgentsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, `${config.name}.md`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Agent '${config.name}' already exists`);
  }

  const content = serializeAgent(config);
  fs.writeFileSync(filePath, content, "utf-8");

  return { ...config, filePath };
}

/**
 * Update an existing agent.
 */
export function updateAgent(
  name: string,
  config: Partial<{
    name: string;
    description: string;
    tools: string[];
    model: string;
    systemPrompt: string;
  }>
): AgentConfig {
  const dir = getAgentsDir();
  const filePath = path.join(dir, `${name}.md`);
  const existing = parseAgentFile(filePath);
  if (!existing) {
    throw new Error(`Agent '${name}' not found`);
  }

  const updated = {
    name: config.name || existing.name,
    description: config.description ?? existing.description,
    tools: config.tools || existing.tools,
    model: config.model ?? existing.model,
    systemPrompt: config.systemPrompt ?? existing.systemPrompt,
  };

  const content = serializeAgent(updated);

  // If renamed, delete old file, create new, and update workflow references
  if (config.name && config.name !== name) {
    fs.unlinkSync(filePath);
    const newPath = path.join(dir, `${config.name}.md`);
    fs.writeFileSync(newPath, content, "utf-8");
    updateWorkflowReferences(name, config.name);
    return { ...updated, filePath: newPath };
  }

  fs.writeFileSync(filePath, content, "utf-8");
  return { ...updated, filePath };
}

/**
 * Delete an agent.
 */
export function deleteAgent(name: string): void {
  const dir = getAgentsDir();
  const filePath = path.join(dir, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Agent '${name}' not found`);
  }
  fs.unlinkSync(filePath);
}
