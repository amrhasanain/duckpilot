// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import readline from "node:readline/promises";
import { c, sym, termWidth, clip, showCursor } from "./ansi.js";
import { box } from "./box.js";

// Handles input, permission prompts and Ctrl+C
export function createTerminal() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });

  let controller = null; // AbortController of the running task
  let lastSigint = 0;
  let closed = false;

  process.on("exit", () => process.stdout.write(showCursor));
  rl.on("close", () => {
    closed = true;
  });

  function shutdown() {
    process.stdout.write(showCursor + "\n");
    rl.close();
    process.exit(0);
  }

  rl.on("SIGINT", () => {
    if (controller) {
      controller.abort(); // cancel the running request
      return;
    }
    const now = Date.now();
    if (now - lastSigint < 2000) shutdown();
    lastSigint = now;
    console.log(c.dim("\n(Press Ctrl+C again to exit)"));
  });

  return {
    // Reads input; pasted multi-line text is collected into one message
    readInput() {
      if (closed) return Promise.resolve(null);
      console.log("\n" + c.dim(sym.hline.repeat(termWidth())));
      return new Promise((resolve) => {
        const lines = [];
        let timer = null;
        const finish = () => {
          rl.off("line", onLine);
          rl.off("close", onClose);
          resolve(lines.join("\n"));
        };
        const onLine = (line) => {
          lines.push(line);
          clearTimeout(timer);
          timer = setTimeout(finish, 60); // pasted lines arrive back to back
        };
        const onClose = () => {
          clearTimeout(timer);
          resolve(lines.length ? lines.join("\n") : null);
        };
        rl.on("line", onLine);
        rl.once("close", onClose);
        rl.setPrompt(`${c.brand(sym.prompt)} `);
        rl.prompt();
      });
    },

    ask: (question) => rl.question(question),

    async confirm(question) {
      const answer = await rl.question(question);
      return answer.trim().toLowerCase() === "y";
    },

    // Ask the user before doing something risky.
    // Returns false (denied), "yes" (this time) or "always" (for this session)
    async permission({ title, detail, alwaysLabel = "Yes, and don't ask again this session" }) {
      const width = termWidth() - 6;
      const lines = String(detail).split("\n").slice(0, 8).map((l) => clip(l, width));
      console.log("\n" + box(lines, { title, color: c.yellow }));
      console.log(`  ${c.bold("Do you want to proceed?")}`);
      console.log(`  ${c.brand("1.")} Yes`);
      console.log(`  ${c.brand("2.")} ${alwaysLabel}`);
      console.log(`  ${c.brand("3.")} No`);

      const signal = controller?.signal;
      for (let tries = 0; tries < 5; tries++) {
        let answer;
        try {
          answer = (
            await rl.question(`  ${c.brand("Choose")} ${c.dim("[1/2/3]")} `, signal ? { signal } : undefined)
          )
            .trim()
            .toLowerCase();
        } catch {
          return false; // interrupted
        }
        if (["1", "y", "yes"].includes(answer)) return "yes";
        if (["2", "a", "always"].includes(answer)) return "always";
        if (["3", "n", "no", ""].includes(answer)) return false;
        console.log(c.dim("  Please enter 1, 2 or 3."));
      }
      return false;
    },

    beginTask() {
      controller = new AbortController();
      return controller.signal;
    },
    endTask() {
      controller = null;
    },
    close() {
      rl.close();
    },
  };
}