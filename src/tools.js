// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { isInside, truncate } from "./utils.js";
import { CONFIG_DIR } from "./config.js";

const execAsync = promisify(exec);

// ---------- تعريف الأدوات للموديل ----------
const PATH_DESC =
  "Relative to the working folder, or an absolute path (e.g. D:\\Projects\\app\\main.py) " +
  "when the user asks for another location";

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: PATH_DESC } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or overwrite a file with the COMPLETE content. Creates missing folders. Never use placeholders.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: PATH_DESC },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace one exact occurrence of old_text with new_text in a file. old_text must match exactly and appear once.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: PATH_DESC },
          old_text: { type: "string" },
          new_text: { type: "string" },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files in a directory",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: PATH_DESC } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a shell command and return stdout/stderr. Never run long-lived or GUI programs.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: {
            type: "string",
            description: "Folder to run the command in (default: the working folder)",
          },
        },
        required: ["command"],
      },
    },
  },
];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// The folder whose approval covers this path: the nearest new project folder,
// or the file's own folder when it already exists
async function approvalScope(full) {
  let cur = path.dirname(full);
  const missing = [];
  while (!(await exists(cur))) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    missing.unshift(path.basename(cur));
    cur = parent;
  }
  return missing.length ? path.join(cur, missing[0]) : path.dirname(full);
}

// ---------- تنفيذ الأدوات ----------
export function createTools({ root, permit }) {
  const approvedDirs = []; // folders outside the working folder approved this session
  const approvedCommands = new Set();

  // "~" means the home folder; relative paths start from the working folder
  function resolvePath(p) {
    let s = String(p ?? ".");
    if (s === "~" || s.startsWith("~/") || s.startsWith("~\\")) {
      s = path.join(os.homedir(), s.slice(1));
    }
    return path.resolve(root, s);
  }

  // Anything outside the working folder needs the user's approval
  async function ensureAccess(full, action) {
    if (isInside(root, full)) return;
    if (isInside(CONFIG_DIR, full)) {
      throw new Error("Access to DuckPilot's settings folder is blocked (it contains your API key).");
    }
    if (approvedDirs.some((dir) => isInside(dir, full))) return;

    const scope = await approvalScope(full);
    const decision = await permit({
      title: `${action} outside working folder`,
      detail: full,
      alwaysLabel: `Yes, and allow everything under ${scope} this session`,
    });
    if (!decision) throw new Error("User denied access outside the working folder.");
    if (decision === "always") approvedDirs.push(scope);
  }

  async function runTool(name, args, { signal } = {}) {
    try {
      switch (name) {
        case "read_file": {
          const full = resolvePath(args.path);
          await ensureAccess(full, "Read");
          return truncate(await fs.readFile(full, "utf8"));
        }

        case "write_file": {
          const full = resolvePath(args.path);
          await ensureAccess(full, "Write");
          await fs.mkdir(path.dirname(full), { recursive: true });
          await fs.writeFile(full, args.content, "utf8");
          return `Wrote ${args.content.length} chars to ${full}`;
        }

        case "edit_file": {
          const full = resolvePath(args.path);
          await ensureAccess(full, "Edit");
          const text = await fs.readFile(full, "utf8");
          const count = text.split(args.old_text).length - 1;
          if (count === 0) return "Error: old_text not found in file.";
          if (count > 1) {
            return `Error: old_text appears ${count} times, make it more specific.`;
          }
          await fs.writeFile(full, text.replace(args.old_text, () => args.new_text), "utf8");
          return `Edited ${full}`;
        }

        case "list_dir": {
          const full = resolvePath(args.path || ".");
          await ensureAccess(full, "List");
          const items = await fs.readdir(full, { withFileTypes: true });
          return (
            items.map((i) => (i.isDirectory() ? i.name + "/" : i.name)).join("\n") || "(empty)"
          );
        }

        case "run_command": {
          const cwd = args.cwd ? resolvePath(args.cwd) : root;
          if (!(await exists(cwd))) return `Error: folder does not exist: ${cwd}`;

          const key = `${cwd}\n${args.command}`;
          if (!approvedCommands.has(key)) {
            const decision = await permit({
              title: "Run command",
              detail: cwd === root ? args.command : `${args.command}\n\nin: ${cwd}`,
              alwaysLabel: "Yes, and don't ask again this session for this exact command",
            });
            if (!decision) return "User denied the command.";
            if (decision === "always") approvedCommands.add(key);
          }

          const { stdout, stderr } = await execAsync(args.command, {
            cwd,
            timeout: 60_000,
            maxBuffer: 1024 * 1024,
            signal,
          });
          return truncate(`STDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (e) {
      // نرجّع الخطأ للموديل عشان يصلّح نفسه
      return `Error: ${e.message}\n${e.stdout ?? ""}\n${e.stderr ?? ""}`;
    }
  }

  return { definitions: toolDefinitions, runTool };
}