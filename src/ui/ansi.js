// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

// Colors, symbols and small terminal helpers (no dependencies).
// Respects NO_COLOR, and FORCE_COLOR=1 forces colors on.

const forced = Boolean(process.env.FORCE_COLOR) && process.env.FORCE_COLOR !== "0";
export const colorEnabled =
  forced ||
  (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== "dumb");

const wrap = (open, close) => (s) =>
  colorEnabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s);

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
  brand: wrap("38;5;214", 39), // duck orange-yellow
};

export const hideCursor = process.stdout.isTTY ? "\x1b[?25l" : "";
export const showCursor = process.stdout.isTTY ? "\x1b[?25h" : "";

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
export const stripAnsi = (s) => String(s).replace(ANSI_RE, "");
export const visibleLength = (s) => [...stripAnsi(s)].length;
export const termWidth = () => Math.max(40, Math.min(process.stdout.columns || 80, 120));

// Cut a single line to n characters, adding an ellipsis
export function clip(s, n) {
  const text = String(s).replace(/\t/g, "  ").replace(/\r/g, "");
  return text.length > n ? text.slice(0, Math.max(1, n - 1)) + "…" : text;
}

// Windows Terminal / VS Code handle Unicode well; old consoles get ASCII
const modern =
  process.platform !== "win32" ||
  Boolean(process.env.WT_SESSION || process.env.TERM_PROGRAM || process.env.ConEmuANSI === "ON");

export const sym = modern
  ? {
      bullet: "●",
      prompt: "❯",
      corner: "⎿",
      star: "✻",
      dot: "·",
      hline: "─",
      spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
      box: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
    }
  : {
      bullet: "*",
      prompt: ">",
      corner: "L",
      star: "*",
      dot: "-",
      hline: "-",
      spinner: ["|", "/", "-", "\\"],
      box: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
    };