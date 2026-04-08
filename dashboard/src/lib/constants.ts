export const AGENT_COLORS: Record<string, string> = {
  orchestrator: "#6366f1", // indigo
  scout: "#22c55e",        // green
  planner: "#a855f7",      // purple
  worker: "#f59e0b",       // amber
  reviewer: "#ef4444",     // red
  "video-creator": "#06b6d4", // cyan
};

export const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-6": "#7c3aed",
  "claude-sonnet-4-6": "#2563eb",
  "claude-haiku-4-5": "#059669",
  "qwen2.5-coder:7b": "#d97706",
};

export const AVAILABLE_MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "anthropic" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic" },
  { id: "qwen2.5-coder:7b", label: "Qwen 2.5 Coder 7B", provider: "ollama" },
];

export const AVAILABLE_TOOLS = [
  "read", "grep", "find", "ls", "bash", "write", "edit",
  "subagent", "notebook", "browser",
];

export const NAV_ITEMS = [
  { label: "Overview", href: "/", icon: "LayoutDashboard" },
  { label: "Sessions", href: "/sessions", icon: "History" },
  { label: "Costs", href: "/costs", icon: "DollarSign" },
  { label: "Agents", href: "/agents", icon: "Bot" },
  { label: "Tools", href: "/tools", icon: "Wrench" },
];
