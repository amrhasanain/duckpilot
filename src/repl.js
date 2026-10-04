// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import { c, sym } from "./ui/ansi.js";
import { showError } from "./ui/render.js";

const HELP = [
  ["/help", "Show this help"],
  ["/clear", "Start a new conversation"],
  ["/model [name]", "Show or change the model"],
  ["/exit", "Quit (or press Ctrl+C twice)"],
];

function printHelp() {
  console.log(`\n${c.bold("Commands")}`);
  for (const [cmd, desc] of HELP) console.log(`  ${c.brand(cmd.padEnd(16))}${c.dim(desc)}`);
  console.log(`\n${c.dim("Tip: you can paste multi-line prompts. Ctrl+C interrupts a running task.")}`);
}

// Returns "exit" when the user wants to quit
function handleSlash(input, { agent, banner }) {
  const [cmd, ...rest] = input.split(/\s+/);

  switch (cmd) {
    case "/help":
      printHelp();
      return;
    case "/clear":
      agent.reset();
      console.clear();
      console.log(banner());
      console.log(c.dim("\nStarted a new conversation."));
      return;
    case "/model":
      if (rest[0]) {
        agent.setModel(rest[0]);
        console.log(`${c.brand(sym.bullet)} Model set to ${c.bold(rest[0])}`);
      } else {
        console.log(`${c.brand(sym.bullet)} Current model: ${c.bold(agent.getModel())}`);
      }
      return;
    case "/exit":
    case "/quit":
      return "exit";
    default:
      console.log(c.yellow(`Unknown command: ${cmd}. Type /help`));
  }
}

export async function runRepl({ agent, term, banner }) {
  console.log(banner());

  while (true) {
    const raw = await term.readInput();
    if (raw === null) break;

    const input = raw.trim();
    if (!input) continue;
    if (["exit", "quit"].includes(input)) break;

    if (input.startsWith("/")) {
      if (handleSlash(input, { agent, banner }) === "exit") break;
      continue;
    }

    const signal = term.beginTask();
    try {
      await agent.chat(input, { signal });
    } catch (e) {
      showError(e);
    } finally {
      term.endTask();
    }
  }

  console.log(c.dim("\nBye 🦆"));
  term.close();
}