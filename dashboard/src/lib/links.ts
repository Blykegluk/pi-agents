import fs from "fs";
import path from "path";
import os from "os";
import type { AgentLink } from "./types";

const LINKS_FILE = path.join(os.homedir(), ".pi", "agent", "links.json");
const PROMPTS_DIR = path.join(os.homedir(), ".pi", "agent", "prompts");

export function loadLinks(): AgentLink[] {
  if (!fs.existsSync(LINKS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LINKS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveLinks(links: AgentLink[]): void {
  const dir = path.dirname(LINKS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2), "utf-8");
}

export function addLink(link: AgentLink): AgentLink {
  const links = loadLinks();
  links.push(link);
  saveLinks(links);
  generateWorkflowFile(link);
  return link;
}

export function updateLink(id: string, updates: Partial<AgentLink>): AgentLink | null {
  const links = loadLinks();
  const index = links.findIndex((l) => l.id === id);
  if (index === -1) return null;

  links[index] = { ...links[index], ...updates };
  saveLinks(links);
  generateWorkflowFile(links[index]);
  return links[index];
}

export function deleteLink(id: string): boolean {
  const links = loadLinks();
  const link = links.find((l) => l.id === id);
  if (!link) return false;

  const filtered = links.filter((l) => l.id !== id);
  saveLinks(filtered);

  // Remove generated workflow file
  const workflowPath = path.join(PROMPTS_DIR, `link-${id}.md`);
  if (fs.existsSync(workflowPath)) {
    fs.unlinkSync(workflowPath);
  }

  return true;
}

/**
 * Generate a Pi Agent workflow .md file for a link.
 * This creates a chain workflow that Pi Agent can execute natively.
 */
function generateWorkflowFile(link: AgentLink): void {
  if (!fs.existsSync(PROMPTS_DIR)) fs.mkdirSync(PROMPTS_DIR, { recursive: true });

  const triggerDesc =
    link.trigger.type === "cron"
      ? `Cron: ${link.trigger.cronExpression}`
      : "Triggered on source output";

  const content = `---
description: "Pipeline: ${link.sourceAgent} → ${link.targetAgent} (${triggerDesc})"
---
Use the subagent tool with the chain parameter to execute this pipeline:

1. First, use the "${link.sourceAgent}" agent to execute: ${link.taskTemplate.replace("{output}", "$@")}
2. Then, use the "${link.targetAgent}" agent to process the output from the previous step: ${link.taskTemplate.replace("{output}", "{previous}")}

Execute this as a chain, passing output between steps via {previous}.
`;

  const filePath = path.join(PROMPTS_DIR, `link-${link.id}.md`);
  fs.writeFileSync(filePath, content, "utf-8");
}
