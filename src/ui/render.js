// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import { c, sym, termWidth, clip } from "./ansi.js";
import { createMarkdownRenderer } from "./markdown.js";

// ---------- assistant text (streamed, rendered line by line) ----------
export function createAssistantWriter(out = process.stdout) {
  const md = createMarkdownRenderer();
  let buf = "";
  let first = true;

  const emit = (raw) => {
    if (first && !raw.trim()) return; // skip leading blank lines
    const rendered = md.line(raw);
    if (rendered === null) return;
    if (first) out.write("\n");
    const prefix = first ? c.brand(sym.bullet) + " " : "  ";
    first = false;
    out.write(prefix + rendered + "\n");
  };

  return {
    write(text) {
      buf += text;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        emit(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    },
    end() {
      if (buf.length) emit(buf);
      buf = "";
    },
  };
}

// ---------- tool calls ----------
const LABELS = {
  read_file: "Read",
  write_file: "Write",
  edit_file: "Update",
  list_dir: "List",
  run_command: "Run",
};

export function showToolCall(name, args) {
  const label = LABELS[name] ?? name;
  const raw = name === "run_command" ? args.command : args.path ?? ".";
  const arg = clip(String(raw ?? "").split("\n")[0], termWidth() - label.length - 8);
  console.log(`\n${c.brand(sym.bullet)} ${c.bold(label)}${c.dim("(")}${arg}${c.dim(")")}`);
}

// print lines under a tool call: first line gets the corner symbol
function block(lines) {
  lines.forEach((line, i) =>
    console.log((i === 0 ? `  ${c.dim(sym.corner)}  ` : "     ") + line)
  );
}

const more = (n) => c.dim(`… +${n} more line${n === 1 ? "" : "s"}`);

export function showToolResult(name, args, result) {
  const w = termWidth() - 8;
  const text = String(result ?? "");

  if (/^Error/.test(text)) {
    const lines = text.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 4);
    return block(lines.map((l) => c.red(clip(l, w))));
  }

  switch (name) {
    case "read_file": {
      const n = text === "" ? 0 : text.split("\n").length;
      return block([c.dim(`Read ${n} line${n === 1 ? "" : "s"}`)]);
    }

    case "write_file": {
      const lines = String(args.content ?? "").replace(/\n$/, "").split("\n");
      const shown = lines.slice(0, 6).map((l) => c.green("+ ") + c.dim(clip(l, w - 2)));
      const rest = lines.length - shown.length;
      return block([
        c.dim(`Wrote ${lines.length} line${lines.length === 1 ? "" : "s"} to ${args.path}`),
        ...shown,
        ...(rest > 0 ? [more(rest)] : []),
      ]);
    }

    case "edit_file": {
      const removed = String(args.old_text ?? "").replace(/\n$/, "").split("\n");
      const added = String(args.new_text ?? "").replace(/\n$/, "").split("\n");
      const rows = [
        ...removed.map((l) => c.red("- " + clip(l, w - 2))),
        ...added.map((l) => c.green("+ " + clip(l, w - 2))),
      ];
      const MAX = 14;
      return block([
        `${c.dim("Updated " + args.path)}  ${c.green("+" + added.length)} ${c.red("-" + removed.length)}`,
        ...rows.slice(0, MAX),
        ...(rows.length > MAX ? [more(rows.length - MAX)] : []),
      ]);
    }

    case "list_dir": {
      const n = text.split("\n").filter(Boolean).length;
      return block([c.dim(`Listed ${n} item${n === 1 ? "" : "s"}`)]);
    }

    case "run_command": {
      if (/^User denied/.test(text)) return block([c.yellow("Command denied")]);
      const body = text.replace(/^STDOUT:\n/, "").replace(/\nSTDERR:\n/, "\n");
      const lines = body.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim());
      if (!lines.length) return block([c.dim("(no output)")]);
      const MAX = 8;
      return block([
        ...lines.slice(0, MAX).map((l) => c.dim(clip(l, w))),
        ...(lines.length > MAX ? [more(lines.length - MAX)] : []),
      ]);
    }

    default:
      return block([c.dim(clip(text.split("\n")[0], w))]);
  }
}

// ---------- notices ----------
export const showNotice = (text) => console.log(c.yellow(`${sym.dot} ${text}`));
export const showInterrupted = () => console.log(`\n  ${c.dim(sym.corner)}  ${c.yellow("Interrupted by user")}`);

export function showError(e) {
  console.log(`\n${c.red("✗ Request failed:")} ${e?.message ?? e}`);
  if (e?.status === 401) {
    console.log(c.dim("  Your API key looks invalid. Set a new one: duckpilot -key <your-groq-api-key>"));
  } else if (e?.status === 429) {
    console.log(c.dim("  Rate limit reached. Wait a moment and try again."));
  }
}

export function showSummary(startedAt, toolCount) {
  const secs = Math.round((Date.now() - startedAt) / 1000);
  if (toolCount === 0 && secs < 3) return;
  const time = secs >= 60 ? `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s` : `${secs}s`;
  console.log(
    "\n" + c.dim(`${sym.star} Worked for ${time} ${sym.dot} ${toolCount} tool call${toolCount === 1 ? "" : "s"}`)
  );
}