// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import { c, sym } from "./ansi.js";

// Tiny line-by-line markdown renderer for the terminal:
// headers, bullets, **bold**, `code`, code blocks, quotes, rules.
export function createMarkdownRenderer() {
  let inCode = false;

  function inline(text) {
    return text
      .split(/(`[^`]+`)/g)
      .map((part, i) =>
        i % 2
          ? c.cyan(part.slice(1, -1))
          : part.replace(/\*\*([^*]+)\*\*/g, (_, t) => c.bold(t))
      )
      .join("");
  }

  // Returns the styled line, or null if the line should be skipped
  function line(raw) {
    const text = raw.replace(/\r$/, "");

    const fence = text.match(/^\s*```\s*([\w+-]*)/);
    if (fence) {
      inCode = !inCode;
      return inCode ? c.dim(`${sym.hline}${sym.hline} ${fence[1] || "code"}`) : null;
    }
    if (inCode) return c.dim(sym.box.v) + " " + text;

    const header = text.match(/^(#{1,6})\s+(.*)/);
    if (header) {
      const styled = c.bold(inline(header[2]));
      return header[1].length <= 2 ? c.brand(styled) : styled;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(text)) return c.dim(sym.hline.repeat(24));

    const bullet = text.match(/^(\s*)[-*]\s+(.*)/);
    if (bullet) return `${bullet[1]}${c.brand("•")} ${inline(bullet[2])}`;

    const quote = text.match(/^>\s?(.*)/);
    if (quote) return c.dim("▎ ") + c.dim(inline(quote[1]));

    return inline(text);
  }

  return { line };
}