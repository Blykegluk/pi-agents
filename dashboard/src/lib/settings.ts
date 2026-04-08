import fs from "fs";
import path from "path";
import os from "os";
import type { OrchestratorSettings } from "./types";

const SETTINGS_FILE = path.join(os.homedir(), ".pi", "agent", "settings.json");
const PROMPT_FILE = path.join(os.homedir(), ".pi", "agent", "orchestrator-prompt.md");

const DEFAULTS: OrchestratorSettings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-opus-4-6",
  defaultThinkingLevel: "medium",
  systemPrompt: "",
};

export function loadSettings(): OrchestratorSettings {
  let settings: OrchestratorSettings = { ...DEFAULTS };

  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      settings = { ...DEFAULTS, ...raw };
    } catch {
      // keep defaults
    }
  }

  // Load prompt from dedicated file
  if (fs.existsSync(PROMPT_FILE)) {
    try {
      settings.systemPrompt = fs.readFileSync(PROMPT_FILE, "utf-8");
    } catch {
      // keep empty
    }
  }

  return settings;
}

export function saveSettings(updates: Partial<OrchestratorSettings>): OrchestratorSettings {
  const current = loadSettings();
  const merged = { ...current, ...updates };

  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Save prompt to dedicated file, keep it out of settings.json
  if (updates.systemPrompt !== undefined) {
    fs.writeFileSync(PROMPT_FILE, updates.systemPrompt, "utf-8");
  }

  // Write settings.json without systemPrompt
  const { systemPrompt: _, ...settingsOnly } = merged;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsOnly, null, 2), "utf-8");

  return merged;
}
