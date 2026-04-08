import fs from "fs";
import path from "path";
import os from "os";
import type { Workflow } from "./types";

const WORKFLOWS_FILE = path.join(os.homedir(), ".pi", "agent", "workflows.json");
const PROMPTS_DIR = path.join(os.homedir(), ".pi", "agent", "prompts");

export function loadWorkflows(): Workflow[] {
  if (!fs.existsSync(WORKFLOWS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(WORKFLOWS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveWorkflows(workflows: Workflow[]): void {
  const dir = path.dirname(WORKFLOWS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(workflows, null, 2), "utf-8");
}

export function getWorkflow(id: string): Workflow | null {
  return loadWorkflows().find((w) => w.id === id) || null;
}

export function createWorkflow(workflow: Workflow): Workflow {
  const workflows = loadWorkflows();
  workflows.push(workflow);
  saveWorkflows(workflows);
  generateWorkflowPromptFile(workflow);
  return workflow;
}

export function updateWorkflow(id: string, updates: Partial<Workflow>): Workflow | null {
  const workflows = loadWorkflows();
  const index = workflows.findIndex((w) => w.id === id);
  if (index === -1) return null;

  workflows[index] = { ...workflows[index], ...updates };
  saveWorkflows(workflows);
  generateWorkflowPromptFile(workflows[index]);
  return workflows[index];
}

export function deleteWorkflow(id: string): boolean {
  const workflows = loadWorkflows();
  const workflow = workflows.find((w) => w.id === id);
  if (!workflow) return false;

  const filtered = workflows.filter((w) => w.id !== id);
  saveWorkflows(filtered);

  // Remove generated prompt file
  const promptPath = path.join(PROMPTS_DIR, `workflow-${id}.md`);
  if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);

  return true;
}

/**
 * Generate a Pi Agent workflow .md file that can be executed natively.
 * Builds a chain from the workflow's links.
 */
function generateWorkflowPromptFile(workflow: Workflow): void {
  if (!fs.existsSync(PROMPTS_DIR)) fs.mkdirSync(PROMPTS_DIR, { recursive: true });

  if (workflow.links.length === 0) return;

  // Build chain order from links using topological sort
  const chain = buildChainOrder(workflow);

  const steps = chain.map((agent, i) => {
    if (i === 0) {
      return `${i + 1}. Use the "${agent}" agent to execute: $@`;
    }
    return `${i + 1}. Then, use the "${agent}" agent to process the output from the previous step (use {previous} placeholder)`;
  });

  const content = `---
description: "${workflow.name} — ${workflow.description}"
---
Use the subagent tool with the chain parameter to execute this workflow:

${steps.join("\n")}

Execute this as a chain, passing output between steps via {previous}.
`;

  const filePath = path.join(PROMPTS_DIR, `workflow-${workflow.id}.md`);
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Build execution order from links (simple topological sort).
 */
function buildChainOrder(workflow: Workflow): string[] {
  const { links, agents } = workflow;
  if (links.length === 0) return agents;

  // Find sources (agents that are sourceAgent but never targetAgent)
  const targets = new Set(links.map((l) => l.targetAgent));
  const sources = agents.filter((a) => !targets.has(a));

  const order: string[] = [];
  const visited = new Set<string>();

  function visit(agent: string) {
    if (visited.has(agent)) return;
    visited.add(agent);
    order.push(agent);

    // Find all agents this one links to
    for (const link of links) {
      if (link.sourceAgent === agent) {
        visit(link.targetAgent);
      }
    }
  }

  for (const source of sources) {
    visit(source);
  }

  // Add any remaining agents not in links
  for (const agent of agents) {
    if (!visited.has(agent)) {
      order.push(agent);
    }
  }

  return order;
}
