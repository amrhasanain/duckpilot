// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import { c, sym, hideCursor, showCursor } from "./ansi.js";

const VERBS = ["Thinking", "Paddling", "Quacking", "Preening", "Waddling", "Splashing"];

// Animated "Thinking… (3s · ctrl+c to interrupt)" line. Does nothing if not a TTY.
export function createSpinner(out = process.stdout) {
  let timer = null;
  let startedAt = 0;
  let frame = 0;
  const animated = Boolean(out.isTTY);

  const draw = () => {
    const secs = Math.floor((Date.now() - startedAt) / 1000);
    const verb = VERBS[Math.floor(secs / 4) % VERBS.length];
    const glyph = sym.spinner[frame++ % sym.spinner.length];
    out.write(
      `\r\x1b[2K${c.brand(glyph)} ${c.brand(verb + "…")} ${c.dim(`(${secs}s ${sym.dot} ctrl+c to interrupt)`)}`
    );
  };

  return {
    get active() {
      return timer !== null;
    },
    start() {
      if (timer || !animated) return;
      startedAt = Date.now();
      frame = 0;
      out.write(hideCursor);
      draw();
      timer = setInterval(draw, 80);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      out.write(`\r\x1b[2K${showCursor}`);
    },
  };
}