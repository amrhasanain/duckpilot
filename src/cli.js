// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Groq from "groq-sdk";
import { CONFIG_PATH, getApiKey, loadConfig, maskKey, saveApiKey } from "./config.js";
import { createTerminal } from "./ui/terminal.js";
import { renderBanner } from "./ui/box.js";
import { showError } from "./ui/render.js";
import { c, sym } from "./ui/ansi.js";
import { createTools } from "./tools.js";
import { createAgent } from "./agent.js";
import { runRepl } from "./repl.js";
import { buildSystemPrompt } from "./prompt.js";
import { VERSION } from "./version.js";

const DEFAULT_MODEL = "openai/gpt-oss-120b"; // or llama-3.3-70b-versatile

function getVersion() {
  return VERSION;
}

function printHelp() {
  console.log(`${c.bold(c.brand(sym.star + " DuckPilot"))} ${c.dim(getVersion())}
A coding agent for your terminal.

${c.bold("Usage")}
  duckpilot -key <api-key>     Save your Groq API key
  duckpilot run                Start the agent in the current folder
  duckpilot run "<task>"       Run a single task and exit
  duckpilot --version          Show version
  duckpilot --help             Show this help

${c.dim("The key is stored in: " + CONFIG_PATH)}`);
}

function setKey(key) {
  if (!key || !key.trim()) {
    console.error("Missing key. Usage: duckpilot -key <your-groq-api-key>");
    process.exitCode = 1;
    return;
  }
  key = key.trim();
  if (!key.startsWith("gsk_")) {
    console.warn(c.yellow("Groq keys usually start with 'gsk_'. Saving anyway."));
  }
  saveApiKey(key);
  console.log(`${c.green("✓")} API key saved (${maskKey(key)})`);
  console.log(c.dim(`  Location: ${CONFIG_PATH}`));
  console.log(c.dim("  Now run: duckpilot run"));
}

async function runAgent(taskArgs) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("No API key found. Run:  duckpilot -key <your-groq-api-key>");
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const term = createTerminal();

  // Warn when running in a very broad folder (drive root or home folder)
  if (root === os.homedir() || root === path.parse(root).root) {
    console.log(c.yellow(`You're in a very broad folder: ${root}`));
    console.log(c.dim("DuckPilot can read and write files anywhere under it."));
    const ok = await term.confirm("Continue? (y/n) ");
    if (!ok) {
      term.close();
      return;
    }
  }

  const config = loadConfig();
  const groq = new Groq({ apiKey });
  const tools = createTools({
    root,
    permit: (request) => term.permission(request),
  });
  const agent = createAgent({
    groq,
    model: config.model || DEFAULT_MODEL,
    tools,
    systemPrompt: buildSystemPrompt({ root }),
  });

  const banner = () => renderBanner({ version: getVersion(), cwd: root, model: agent.getModel() });

  if (taskArgs.length) {
    // one-shot: duckpilot run "your task"
    const signal = term.beginTask();
    try {
      await agent.chat(taskArgs.join(" "), { signal });
    } catch (e) {
      showError(e);
      process.exitCode = 1;
    } finally {
      term.endTask();
      term.close();
    }
  } else {
    await runRepl({ agent, term, banner });
  }
}

export async function main(argv) {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case "-key":
    case "--key":
    case "key":
      return setKey(rest[0]);

    case "run":
      return runAgent(rest);

    case "-v":
    case "--version":
      console.log(getVersion());
      return;

    case undefined:
    case "-h":
    case "--help":
    case "help":
      return printHelp();

    default:
      console.error(`Unknown command: ${cmd}\n`);
      printHelp();
      process.exitCode = 1;
  }
}