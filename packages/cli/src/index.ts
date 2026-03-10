#!/usr/bin/env node
import inquirer from "inquirer";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { dump } from "js-yaml";

const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
const configDir = resolve(home, ".claude-bridge");

async function setup() {
  console.log("\n  Claude Code Live Bridge — Setup\n");

  const answers = await inquirer.prompt([
    { type: "input", name: "phone", message: "Your WhatsApp phone number (E.164, e.g. +1234567890):" },
    { type: "password", name: "pin", message: "4-digit PIN for destructive commands:", validate: (v: string) => /^\d{4}$/.test(v) || "Must be 4 digits" },
    { type: "number", name: "rateLimit", message: "Max commands per hour:", default: 30 },
    { type: "list", name: "gitContextMode", message: "Git context injection:", choices: ["auto", "on-demand"], default: "auto" },
  ]);

  const config = {
    server: { port: 9377, host: "127.0.0.1", vscodePort: 9378 },
    whatsapp: {
      allowedNumbers: [answers.phone],
      sessionPath: resolve(configDir, "wa-session"),
      pin: answers.pin,
      rateLimit: { maxPerHour: answers.rateLimit, burstMax: 5 },
    },
    classifier: { statusBatchInterval: 10, waitTimeout: 500, maxMessageLength: 1500 },
    gitContext: { mode: answers.gitContextMode },
    safety: {
      auditLog: { path: resolve(configDir, "audit.db"), retentionDays: 30 },
    },
    sessions: { fuzzyMatch: true, decisionTimeout: 0, crossSessionNotify: true },
  };

  mkdirSync(configDir, { recursive: true });
  writeFileSync(resolve(configDir, "config.yaml"), dump(config));
  console.log(`\n  Config saved to ${resolve(configDir, "config.yaml")}`);
  console.log("  Run 'claude-bridge start' to launch the agent.\n");
}

const cmd = process.argv[2];
if (cmd === "setup" || !cmd) {
  setup().catch(console.error);
} else {
  console.log("Usage: claude-bridge [setup]");
}
