import type {
  SessionSummary,
  JournalEvent,
  MessageEvent,
  AssistantMessage,
  ToolResultMessage,
  OverviewStats,
  CostBreakdown,
  CostByModel,
  CostByAgent,
  DailyCost,
  AgentStats,
  ToolStats,
} from "./types";
import { getAllSessionSummaries, listSessionFiles, parseSessionFile } from "./sessions";

// ============================================================
// Overview Stats
// ============================================================

export function computeOverviewStats(summaries?: SessionSummary[]): OverviewStats {
  const sessions = summaries || getAllSessionSummaries();

  const totalCost = sessions.reduce((sum, s) => sum + s.totalCost, 0);
  const totalTokens = sessions.reduce((sum, s) => sum + s.totalTokens, 0);
  const totalErrors = sessions.reduce((sum, s) => sum + s.errors, 0);
  const totalToolCalls = sessions.reduce((sum, s) => sum + s.toolCalls, 0);
  const errorRate = totalToolCalls > 0 ? totalErrors / totalToolCalls : 0;

  // Cost by day
  const costMap = new Map<string, number>();
  for (const s of sessions) {
    const date = s.timestamp.split("T")[0];
    costMap.set(date, (costMap.get(date) || 0) + s.totalCost);
  }

  const costByDay = Array.from(costMap.entries())
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalCost,
    totalTokens,
    sessionCount: sessions.length,
    errorRate,
    costByDay,
  };
}

// ============================================================
// Cost Breakdown
// ============================================================

export function computeCostBreakdown(): CostBreakdown {
  const files = listSessionFiles();
  const byModelMap = new Map<string, { cost: number; tokens: number }>();
  const byAgentMap = new Map<string, { cost: number; invocations: number }>();
  const byDayMap = new Map<string, { cost: number; byModel: Record<string, number> }>();
  let totalCost = 0;
  let totalCacheRead = 0;
  let totalInputTokens = 0;
  let estimatedInputCostRate = 0;
  let estimatedCacheReadRate = 0;

  for (const f of files) {
    const events = parseSessionFile(f.filePath);
    const date = f.timestamp.split("T")[0];

    for (const event of events) {
      if (event.type !== "message") continue;
      const msg = (event as MessageEvent).message;

      if (msg.role === "assistant") {
        const a = msg as AssistantMessage;
        if (!a.usage) continue;

        const model = a.model;
        const cost = a.usage.cost.total;
        totalCost += cost;

        // By model
        const existing = byModelMap.get(model) || { cost: 0, tokens: 0 };
        existing.cost += cost;
        existing.tokens += a.usage.totalTokens;
        byModelMap.set(model, existing);

        // By day
        const dayEntry = byDayMap.get(date) || { cost: 0, byModel: {} };
        dayEntry.cost += cost;
        dayEntry.byModel[model] = (dayEntry.byModel[model] || 0) + cost;
        byDayMap.set(date, dayEntry);

        // Orchestrator cost
        const orchEntry = byAgentMap.get("orchestrator") || { cost: 0, invocations: 0 };
        orchEntry.cost += cost;
        orchEntry.invocations++;
        byAgentMap.set("orchestrator", orchEntry);

        // Cache savings calc
        totalCacheRead += a.usage.cacheRead;
        totalInputTokens += a.usage.input;
        if (a.usage.input > 0 && a.usage.cost.input > 0) {
          estimatedInputCostRate = a.usage.cost.input / a.usage.input;
        }
        if (a.usage.cacheRead > 0 && a.usage.cost.cacheRead > 0) {
          estimatedCacheReadRate = a.usage.cost.cacheRead / a.usage.cacheRead;
        }
      }

      if (msg.role === "toolResult") {
        const tr = msg as ToolResultMessage;
        if (tr.details?.results) {
          for (const result of tr.details.results) {
            const agentName = result.agent;
            const agentCost = result.usage?.cost || 0;

            const entry = byAgentMap.get(agentName) || { cost: 0, invocations: 0 };
            entry.cost += agentCost;
            entry.invocations++;
            byAgentMap.set(agentName, entry);

            // By model for subagent
            if (result.model && result.usage) {
              const modelEntry = byModelMap.get(result.model) || { cost: 0, tokens: 0 };
              modelEntry.cost += agentCost;
              modelEntry.tokens += result.usage.contextTokens || 0;
              byModelMap.set(result.model, modelEntry);
            }
          }
        }
      }
    }
  }

  const cacheSavings =
    estimatedInputCostRate > 0 && estimatedCacheReadRate > 0
      ? totalCacheRead * (estimatedInputCostRate - estimatedCacheReadRate)
      : 0;

  return {
    byModel: Array.from(byModelMap.entries()).map(([model, data]) => ({
      model,
      ...data,
    })),
    byAgent: Array.from(byAgentMap.entries()).map(([agent, data]) => ({
      agent,
      ...data,
    })),
    byDay: Array.from(byDayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    cacheSavings,
    totalCost,
  };
}

// ============================================================
// Agent Stats
// ============================================================

export function computeAgentStats(): AgentStats[] {
  const files = listSessionFiles();
  const agentMap = new Map<
    string,
    {
      model: string;
      invocations: number;
      totalCost: number;
      totalTokens: number;
      errors: number;
      tools: Map<string, number>;
    }
  >();

  for (const f of files) {
    const events = parseSessionFile(f.filePath);

    for (const event of events) {
      if (event.type !== "message") continue;
      const msg = (event as MessageEvent).message;

      if (msg.role === "toolResult") {
        const tr = msg as ToolResultMessage;
        if (!tr.details?.results) continue;

        for (const result of tr.details.results) {
          const entry = agentMap.get(result.agent) || {
            model: result.model,
            invocations: 0,
            totalCost: 0,
            totalTokens: 0,
            errors: 0,
            tools: new Map<string, number>(),
          };

          entry.invocations++;
          entry.totalCost += result.usage?.cost || 0;
          entry.totalTokens += result.usage?.contextTokens || 0;
          if (result.exitCode !== 0) entry.errors++;

          // Extract tools from subagent messages
          for (const m of result.messages || []) {
            if (m.role === "assistant") {
              for (const block of m.content) {
                if (block.type === "toolCall") {
                  const tc = block as { name: string };
                  entry.tools.set(tc.name, (entry.tools.get(tc.name) || 0) + 1);
                }
              }
            }
          }

          agentMap.set(result.agent, entry);
        }
      }
    }
  }

  return Array.from(agentMap.entries()).map(([name, data]) => {
    const topTools = Array.from(data.tools.entries())
      .map(([toolName, count]) => ({ name: toolName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      name,
      model: data.model,
      invocations: data.invocations,
      totalCost: data.totalCost,
      avgCost: data.invocations > 0 ? data.totalCost / data.invocations : 0,
      totalTokens: data.totalTokens,
      avgTokens: data.invocations > 0 ? data.totalTokens / data.invocations : 0,
      successRate:
        data.invocations > 0
          ? ((data.invocations - data.errors) / data.invocations) * 100
          : 100,
      errors: data.errors,
      topTools,
    };
  });
}

// ============================================================
// Tool Stats
// ============================================================

export function computeToolStats(): ToolStats[] {
  const files = listSessionFiles();
  const toolMap = new Map<string, { calls: number; errors: number }>();

  for (const f of files) {
    const events = parseSessionFile(f.filePath);

    for (const event of events) {
      if (event.type !== "message") continue;
      const msg = (event as MessageEvent).message;

      if (msg.role === "toolResult") {
        const tr = msg as ToolResultMessage;
        const entry = toolMap.get(tr.toolName) || { calls: 0, errors: 0 };
        entry.calls++;
        if (tr.isError) entry.errors++;
        toolMap.set(tr.toolName, entry);

        // Also count tools used within subagents
        if (tr.details?.results) {
          for (const result of tr.details.results) {
            for (const m of result.messages || []) {
              if (m.role === "assistant") {
                for (const block of m.content) {
                  if (block.type === "toolCall") {
                    const tc = block as { name: string };
                    const te = toolMap.get(tc.name) || { calls: 0, errors: 0 };
                    te.calls++;
                    toolMap.set(tc.name, te);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return Array.from(toolMap.entries())
    .map(([name, data]) => ({
      name,
      callCount: data.calls,
      errors: data.errors,
      errorRate: data.calls > 0 ? (data.errors / data.calls) * 100 : 0,
    }))
    .sort((a, b) => b.callCount - a.callCount);
}
