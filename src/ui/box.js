// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import { c, sym, visibleLength, termWidth } from "./ansi.js";

// Draw a rounded box around lines of text (optional title in the top border)
export function box(lines, { title = "", color = c.gray } = {}) {
  const b = sym.box;
  const titleLen = title ? visibleLength(title) : 0;
  const inner = Math.max(titleLen ? titleLen + 1 : 0, ...lines.map(visibleLength));

  const top = title
    ? color(b.tl + b.h + " ") + c.bold(title) + color(" " + b.h.repeat(inner - titleLen - 1) + b.tr)
    : color(b.tl + b.h.repeat(inner + 2) + b.tr);

  const rows = lines.map(
    (line) => color(b.v) + " " + line + " ".repeat(inner - visibleLength(line)) + " " + color(b.v)
  );
  const bottom = color(b.bl + b.h.repeat(inner + 2) + b.br);

  return [top, ...rows, bottom].join("\n");
}

export function renderBanner({ version, cwd, model }) {
  const max = Math.max(20, termWidth() - 14);
  const folder = cwd.length > max ? "…" + cwd.slice(-(max - 1)) : cwd;
  const lines = [
    `${c.bold(c.brand(sym.star + " DuckPilot"))} ${c.dim("v" + version)}`,
    "",
    `${c.dim("Folder")}  ${folder}`,
    `${c.dim("Model ")}  ${model}`,
    "",
    c.dim(`/help for commands ${sym.dot} ctrl+c to interrupt`),
  ];
  return box(lines, { color: c.brand });
}