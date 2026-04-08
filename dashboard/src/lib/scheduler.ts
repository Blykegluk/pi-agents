import { loadWorkflows, updateWorkflow } from "./workflows";
import { runWorkflow } from "./runner";
import type { Workflow } from "./types";

// Use globalThis to persist across HMR
const globalAny = globalThis as unknown as {
  __piSchedulerInterval?: ReturnType<typeof setInterval>;
  __piSchedulerStarted?: boolean;
};

/**
 * Check if a cron expression matches the current time.
 * Simple cron parser: minute hour day month dayOfWeek
 */
function cronMatches(cronExpr: string, date: Date): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minExpr, hourExpr, dayExpr, monthExpr, dowExpr] = parts;
  const minute = date.getMinutes();
  const hour = date.getHours();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const dow = date.getDay();

  return (
    matchField(minExpr, minute) &&
    matchField(hourExpr, hour) &&
    matchField(dayExpr, day) &&
    matchField(monthExpr, month) &&
    matchField(dowExpr, dow)
  );
}

function matchField(expr: string, value: number): boolean {
  if (expr === "*") return true;

  // Handle */N (every N)
  if (expr.startsWith("*/")) {
    const interval = parseInt(expr.slice(2));
    return value % interval === 0;
  }

  // Handle comma-separated values
  const values = expr.split(",");
  for (const v of values) {
    // Handle range (e.g., 1-5)
    if (v.includes("-")) {
      const [start, end] = v.split("-").map(Number);
      if (value >= start && value <= end) return true;
    } else {
      if (parseInt(v) === value) return true;
    }
  }
  return false;
}

/**
 * Calculate next run time for a cron expression.
 */
function getNextRunTime(cronExpr: string, timezone: string): string {
  // Simple: check the next 1440 minutes (24h) to find the next match
  const now = new Date();
  for (let i = 1; i <= 1440; i++) {
    const future = new Date(now.getTime() + i * 60000);
    // Convert to timezone
    const tzDate = new Date(
      future.toLocaleString("en-US", { timeZone: timezone })
    );
    if (cronMatches(cronExpr, tzDate)) {
      return future.toISOString();
    }
  }
  return "";
}

/**
 * Check all scheduled workflows and run any that match.
 */
function checkSchedules(): void {
  const workflows = loadWorkflows();

  for (const wf of workflows) {
    if (!wf.schedule?.enabled || !wf.schedule.cronExpression) continue;

    const tz = wf.schedule.timezone || "Europe/Paris";
    const now = new Date();
    const tzNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));

    if (cronMatches(wf.schedule.cronExpression, tzNow)) {
      // Don't run if already ran this minute
      if (wf.schedule.lastRunAt) {
        const lastRun = new Date(wf.schedule.lastRunAt);
        const diffMs = now.getTime() - lastRun.getTime();
        if (diffMs < 60000) continue; // Skip if ran less than 1 minute ago
      }

      console.log(
        `[Scheduler] Running workflow "${wf.name}" (cron: ${wf.schedule.cronExpression})`
      );

      // Update lastRunAt
      const nextRun = getNextRunTime(wf.schedule.cronExpression, tz);
      updateWorkflow(wf.id, {
        schedule: {
          ...wf.schedule,
          lastRunAt: now.toISOString(),
          nextRunAt: nextRun,
        },
      });

      // Run the workflow
      runWorkflow({
        workflow: wf,
        task: wf.schedule.task || "Execute the daily workflow",
        onData: (data) => {
          console.log(`[Scheduler][${wf.name}] ${data.substring(0, 100)}`);
        },
        onDone: (exitCode) => {
          console.log(
            `[Scheduler][${wf.name}] Completed with exit code ${exitCode}`
          );
        },
        onError: (error) => {
          console.error(`[Scheduler][${wf.name}] Error: ${error}`);
        },
      });
    }
  }
}

/**
 * Start the scheduler. Checks every minute.
 */
export function startScheduler(): void {
  if (globalAny.__piSchedulerStarted) return;

  console.log("[Scheduler] Starting...");
  globalAny.__piSchedulerStarted = true;

  // Check every 60 seconds
  globalAny.__piSchedulerInterval = setInterval(checkSchedules, 60000);

  // Also check immediately
  checkSchedules();
}
