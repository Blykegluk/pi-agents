import fs from "fs";
import path from "path";
import os from "os";
import type { ApiConfig, AgentApisConfig } from "./types";

const APIS_FILE = path.join(os.homedir(), ".pi", "agent", "apis.json");

/**
 * Load all API configs.
 */
export function loadApis(): AgentApisConfig {
  if (!fs.existsSync(APIS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(APIS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Save all API configs.
 */
function saveApis(config: AgentApisConfig): void {
  const dir = path.dirname(APIS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(APIS_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Get APIs for a specific agent.
 */
export function getAgentApis(agentName: string): ApiConfig[] {
  const config = loadApis();
  return config[agentName] || [];
}

/**
 * Set APIs for a specific agent.
 */
export function setAgentApis(agentName: string, apis: ApiConfig[]): void {
  const config = loadApis();
  config[agentName] = apis;
  saveApis(config);
}

/**
 * Add an API to an agent.
 */
export function addAgentApi(agentName: string, api: ApiConfig): void {
  const apis = getAgentApis(agentName);
  apis.push(api);
  setAgentApis(agentName, apis);
}

/**
 * Update an API for an agent.
 */
export function updateAgentApi(
  agentName: string,
  apiId: string,
  updates: Partial<ApiConfig>
): ApiConfig | null {
  const apis = getAgentApis(agentName);
  const index = apis.findIndex((a) => a.id === apiId);
  if (index === -1) return null;

  apis[index] = { ...apis[index], ...updates };
  setAgentApis(agentName, apis);
  return apis[index];
}

/**
 * Delete an API from an agent.
 */
export function deleteAgentApi(agentName: string, apiId: string): boolean {
  const apis = getAgentApis(agentName);
  const filtered = apis.filter((a) => a.id !== apiId);
  if (filtered.length === apis.length) return false;
  setAgentApis(agentName, filtered);
  return true;
}

/**
 * Generate prompt injection text for an agent's APIs.
 * This text gets appended to the agent's system prompt.
 */
export function generateApiPromptSection(agentName: string): string {
  const apis = getAgentApis(agentName);
  if (apis.length === 0) return "";

  const sections = apis.map((api) => {
    let authInstruction = "";
    if (api.authType === "api-key" && api.authEnvVar) {
      authInstruction = `Authentication: Include header "${api.authHeader || "X-API-Key"}: $${api.authEnvVar}" in all requests.`;
    } else if (api.authType === "bearer" && api.authEnvVar) {
      authInstruction = `Authentication: Include header "Authorization: Bearer $${api.authEnvVar}" in all requests.`;
    }

    const endpoints = api.endpoints
      .map(
        (ep) => `  - ${ep.method} ${api.baseUrl}${ep.path} — ${ep.description}`
      )
      .join("\n");

    return `### ${api.name}\nBase URL: ${api.baseUrl}\n${authInstruction}\n\nAvailable endpoints:\n${endpoints}`;
  });

  return `\n\n---\n\n## External APIs\n\nYou have access to the following APIs. Use bash + curl to call them.\n\n${sections.join("\n\n")}`;
}
