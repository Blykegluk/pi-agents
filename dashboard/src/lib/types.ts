// ============================================================
// JSONL Session Event Types (mirrors Pi Agent's session format)
// ============================================================

export interface SessionEvent {
  type: "session";
  version: number;
  id: string;
  timestamp: string;
  cwd: string;
}

export interface ModelChangeEvent {
  type: "model_change";
  id: string;
  parentId: string | null;
  timestamp: string;
  provider: string;
  modelId: string;
}

export interface ThinkingLevelChangeEvent {
  type: "thinking_level_change";
  id: string;
  parentId: string | null;
  timestamp: string;
  thinkingLevel: string;
}

export interface UsageCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: UsageCost;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature: string;
}

export interface ToolCallContent {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type MessageContent = TextContent | ThinkingContent | ToolCallContent;

export interface SubagentUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

export interface SubagentMessage {
  role: "user" | "assistant";
  content: MessageContent[];
  timestamp: number;
}

export interface SubagentResult {
  agent: string;
  agentSource: "user" | "project";
  task: string;
  exitCode: number;
  messages: SubagentMessage[];
  stderr: string;
  usage: SubagentUsage;
  model: string;
  stopReason: string;
}

export interface SubagentDetails {
  mode: "single" | "parallel" | "chain";
  agentScope: string;
  projectAgentsDir: string | null;
  results: SubagentResult[];
}

export interface UserMessage {
  role: "user";
  content: MessageContent[];
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: MessageContent[];
  api: string;
  provider: string;
  model: string;
  usage: Usage;
  stopReason: string;
  timestamp: number;
  responseId: string;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: TextContent[];
  details?: SubagentDetails;
  isError: boolean;
  timestamp: number;
}

export type AnyMessage = UserMessage | AssistantMessage | ToolResultMessage;

export interface MessageEvent {
  type: "message";
  id: string;
  parentId: string | null;
  timestamp: string;
  message: AnyMessage;
}

export type JournalEvent =
  | SessionEvent
  | ModelChangeEvent
  | ThinkingLevelChangeEvent
  | MessageEvent;

// ============================================================
// Aggregated / Dashboard Types
// ============================================================

export interface SessionSummary {
  id: string;
  timestamp: string;
  cwd: string;
  workspace: string;
  duration: number; // ms
  messageCount: number;
  totalCost: number;
  totalTokens: number;
  models: string[];
  agents: string[];
  toolCalls: number;
  errors: number;
}

export interface OverviewStats {
  totalCost: number;
  totalTokens: number;
  sessionCount: number;
  errorRate: number;
  costByDay: { date: string; cost: number }[];
}

export interface CostByModel {
  model: string;
  cost: number;
  tokens: number;
}

export interface CostByAgent {
  agent: string;
  cost: number;
  invocations: number;
}

export interface DailyCost {
  date: string;
  cost: number;
  byModel: Record<string, number>;
}

export interface CostBreakdown {
  byModel: CostByModel[];
  byAgent: CostByAgent[];
  byDay: DailyCost[];
  cacheSavings: number;
  totalCost: number;
}

export interface AgentStats {
  name: string;
  model: string;
  invocations: number;
  totalCost: number;
  avgCost: number;
  totalTokens: number;
  avgTokens: number;
  successRate: number;
  errors: number;
  topTools: { name: string; count: number }[];
}

export interface ToolStats {
  name: string;
  callCount: number;
  errors: number;
  errorRate: number;
}

// ============================================================
// Agent Config Types (for CRUD)
// ============================================================

export interface AgentConfig {
  name: string;
  description: string;
  tools: string[];
  model: string;
  systemPrompt: string;
  filePath: string;
}

export interface ApiEndpoint {
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
}

export interface ApiConfig {
  id: string;
  name: string;
  baseUrl: string;
  authType: "api-key" | "bearer" | "none";
  authHeader?: string;
  authEnvVar?: string;
  apiKey?: string;
  endpoints: ApiEndpoint[];
}

export interface AgentApisConfig {
  [agentName: string]: ApiConfig[];
}

// ============================================================
// Orchestrator Settings
// ============================================================

export interface OrchestratorSettings {
  defaultProvider: string;
  defaultModel: string;
  defaultThinkingLevel: string;
  systemPrompt?: string;
  lastChangelogVersion?: string;
}

// ============================================================
// Agent Links / Pipelines
// ============================================================

export interface AgentLink {
  id: string;
  sourceAgent: string;
  targetAgent: string;
  trigger: {
    type: "cron" | "event";
    cronExpression?: string;
  };
  taskTemplate: string;
  enabled: boolean;
}

// ============================================================
// Workflows
// ============================================================

export interface Workflow {
  id: string;
  name: string;
  description: string;
  orchestrator: {
    model: string;
    thinkingLevel: string;
    systemPrompt: string;
  };
  agents: string[];
  links: AgentLink[];
  enabled: boolean;
  schedule?: {
    enabled: boolean;
    cronExpression: string;
    timezone: string;
    task: string;
    lastRunAt?: string;
    nextRunAt?: string;
  };
}
