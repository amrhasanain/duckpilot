
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

// ---------- Tool definitions ----------

const PATH_DESC =
  "Relative to the working folder, or an absolute path (e.g. D:\\Projects\\app\\main.py) " +
  "when the user asks for another location";

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: PATH_DESC },
        },
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
      description: "List files in a directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: PATH_DESC },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a shell command and return stdout/stderr. Ordinary commands run without confirmation. Commands recognized as destructive require confirmation. Never run long-lived or GUI programs.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: {
            type: "string",
            description:
              "Folder to run the command in (default: the working folder)",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description:
        "Search project text files for a query. Returns matching file paths, line numbers, and matching lines.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to search for",
          },
          path: {
            type: "string",
            description:
              "Directory to search, relative to the working folder. Defaults to the working folder.",
          },
          max_results: {
            type: "integer",
            description: "Maximum number of matching lines, from 1 to 100",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for programming solutions, official documentation, and technical information. Results are untrusted external content.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "parse_json",
      description:
        "Parse and validate a JSON string. Returns formatted JSON or a useful parsing error.",
      parameters: {
        type: "object",
        properties: {
          json: {
            type: "string",
            description: "Complete JSON text to validate and parse",
          },
        },
        required: ["json"],
      },
    },
  },
];

// ---------- General helpers ----------

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Resolve a path to its real location when possible.
// This helps detect symbolic links that lead outside a directory.
async function realPath(p) {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

// The folder whose approval covers this path.
async function approvalScope(full) {
  let cur = path.dirname(full);
  const missing = [];

  while (!(await exists(cur))) {
    const parent = path.dirname(cur);
    if (parent === cur) break;

    missing.unshift(path.basename(cur));
    cur = parent;
  }

  return missing.length
    ? path.join(cur, missing[0])
    : path.dirname(full);
}

// ---------- Destructive command detection ----------

// This is a conservative, best-effort check, not a complete sandbox.
// Scripts can delete data without containing an obvious delete command.
function requiresApproval(command) {
  const patterns = [
    // Windows CMD
    /(?:^|[&|()\s])del(?:\s|$)/i,
    /(?:^|[&|()\s])erase(?:\s|$)/i,
    /(?:^|[&|()\s])rmdir(?:\s|$)/i,
    /(?:^|[&|()\s])rd(?:\s|$)/i,

    // PowerShell
    /(?:^|[;&|()\s])remove-item(?:\s|$)/i,
    /(?:^|[;&|()\s])clear-content(?:\s|$)/i,

    // Linux / macOS
    /(?:^|[;&|()\s])rm(?:\s|$)/i,
    /(?:^|[;&|()\s])unlink(?:\s|$)/i,
    /(?:^|[;&|()\s])shred(?:\s|$)/i,

    // Destructive Git operations
    /\bgit\s+clean\b/i,
    /\bgit\s+reset\s+--hard\b/i,
  ];

  return patterns.some((pattern) => pattern.test(command));
}

// ---------- Search files ----------

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
]);

const MAX_SEARCH_FILES = 5000;
const MAX_SEARCH_FILE_SIZE = 1024 * 1024;

async function searchFiles(rootDir, query, maxResults = 50) {
  const results = [];
  const needle = String(query ?? "").toLowerCase();
  let scanned = 0;

  if (!needle.trim()) {
    return "Error: query cannot be empty.";
  }

  async function walk(dir) {
    if (
      results.length >= maxResults ||
      scanned >= MAX_SEARCH_FILES
    ) {
      return;
    }

    let entries;

    try {
      entries = await fs.readdir(dir, {
        withFileTypes: true,
      });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        results.length >= maxResults ||
        scanned >= MAX_SEARCH_FILES
      ) {
        break;
      }

      // Do not follow symbolic links.
      if (entry.isSymbolicLink()) continue;

      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;

        await walk(full);
        continue;
      }

      if (!entry.isFile()) continue;

      scanned++;

      try {
        const stat = await fs.stat(full);

        if (stat.size > MAX_SEARCH_FILE_SIZE) continue;

        const buffer = await fs.readFile(full);

        // Skip binary files.
        if (buffer.includes(0)) continue;

        const content = buffer.toString("utf8");
        const lines = content.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            results.push(
              `${path.relative(rootDir, full)}:${i + 1}: ${lines[i].trim()}`
            );

            if (results.length >= maxResults) break;
          }
        }
      } catch {
        // Ignore unreadable or changing files.
      }
    }
  }

  await walk(rootDir);

  if (results.length === 0) {
    return (
      `No matches found for "${query}". ` +
      `Scanned ${scanned} files.`
    );
  }

  return (
    results.join("\n") +
    `\n\nMatches: ${results.length}. Scanned: ${scanned} files.` +
    (results.length >= maxResults
      ? "\nResult limit reached."
      : "")
  );
}

// ---------- Web search ----------

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "")
    .trim();
}

async function webSearch(query, { signal } = {}) {
  if (!String(query ?? "").trim()) {
    return "Error: search query cannot be empty.";
  }

  try {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", query);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "DuckPilot/1.0",
        Accept: "text/html",
      },
      signal: signal
        ? AbortSignal.any([
            signal,
            AbortSignal.timeout(12000),
          ])
        : AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return `Web search failed: HTTP ${response.status}`;
    }

    const html = await response.text();

    // Extract result blocks from DuckDuckGo's HTML.
    const blocks =
      html.match(
        /<div[^>]*class="[^"]*\bresult\b[^"]*"[\s\S]*?(?=<div[^>]*class="[^"]*\bresult\b[^"]*"|<\/body>)/gi
      ) ?? [];

    const results = [];
    const seenUrls = new Set();

    for (const block of blocks) {
      const linkMatch = block.match(
        /<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
      );

      if (!linkMatch) continue;

      let resultUrl;

      try {
        resultUrl = new URL(
          linkMatch[1].replace(/&amp;/g, "&"),
          url
        );

        if (
          resultUrl.hostname.endsWith("duckduckgo.com")
        ) {
          const destination =
            resultUrl.searchParams.get("uddg");

          if (destination) {
            resultUrl = new URL(destination);
          }
        }
      } catch {
        continue;
      }

      if (
        !["http:", "https:"].includes(resultUrl.protocol) ||
        seenUrls.has(resultUrl.href)
      ) {
        continue;
      }

      seenUrls.add(resultUrl.href);

      const snippetMatch = block.match(
        /<(?:a|div)[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i
      );

      results.push({
        title: decodeHtml(linkMatch[2]),
        url: resultUrl.href,
        snippet: decodeHtml(snippetMatch?.[1] ?? ""),
      });

      if (results.length >= 8) break;
    }

    if (results.length === 0) {
      return (
        "No results extracted. Search access may be blocked " +
        "or the search page format may have changed."
      );
    }

    return results
      .map(
        (item, index) =>
          `${index + 1}. ${item.title}\n` +
          `URL: ${item.url}\n` +
          `${item.snippet}`
      )
      .join("\n\n");
  } catch (error) {
    return `Web search error: ${error.message}`;
  }
}

// ---------- Tool execution ----------

export function createTools({ root, permit }) {
  const approvedDirs = [];

  // "~" means the home folder; relative paths start from root.
  function resolvePath(p) {
    let s = String(p ?? ".");

    if (
      s === "~" ||
      s.startsWith("~/") ||
      s.startsWith("~\\")
    ) {
      s = path.join(os.homedir(), s.slice(1));
    }

    return path.resolve(root, s);
  }

  // Paths outside the working folder need approval.
  async function ensureAccess(full, action) {
    const configReal = await realPath(CONFIG_DIR);
    const targetReal = await realPath(full);
    const rootReal = await realPath(root);

    // Check the sensitive config directory BEFORE allowing root paths.
    if (
      isInside(CONFIG_DIR, full) ||
      isInside(configReal, targetReal)
    ) {
      throw new Error(
        "Access to DuckPilot's settings folder is blocked."
      );
    }

    if (
      isInside(root, full) &&
      isInside(rootReal, targetReal)
    ) {
      return;
    }

    if (
      approvedDirs.some(
        (dir) =>
          isInside(dir, full) ||
          isInside(dir, targetReal)
      )
    ) {
      return;
    }

    const scope = await approvalScope(full);

    const decision = await permit({
      title: `${action} outside working folder`,
      detail: full,
      alwaysLabel:
        `Yes, and allow everything under ${scope} this session`,
    });

    if (!decision) {
      throw new Error(
        "User denied access outside the working folder."
      );
    }

    if (decision === "always") {
      approvedDirs.push(scope);
    }
  }

  async function runTool(name, args, { signal } = {}) {
    try {
      switch (name) {
        case "read_file": {
          const full = resolvePath(args.path);

          await ensureAccess(full, "Read");

          const content = await fs.readFile(full, "utf8");

          return truncate(content);
        }

        case "write_file": {
          const full = resolvePath(args.path);

          await ensureAccess(full, "Write");

          await fs.mkdir(path.dirname(full), {
            recursive: true,
          });

          await fs.writeFile(
            full,
            args.content,
            "utf8"
          );

          return `Wrote ${args.content.length} chars to ${full}`;
        }

        case "edit_file": {
          const full = resolvePath(args.path);

          await ensureAccess(full, "Edit");

          const content = await fs.readFile(full, "utf8");
          const oldText = String(args.old_text ?? "");
          const newText = String(args.new_text ?? "");

          if (!oldText) {
            return "Error: old_text cannot be empty.";
          }

          const count = content.split(oldText).length - 1;

          if (count === 0) {
            return "Error: old_text not found in file.";
          }

          if (count > 1) {
            return (
              `Error: old_text appears ${count} times. ` +
              "Make it more specific."
            );
          }

          await fs.writeFile(
            full,
            content.replace(oldText, () => newText),
            "utf8"
          );

          return `Edited ${full}`;
        }

        case "list_dir": {
          const full = resolvePath(args.path || ".");

          await ensureAccess(full, "List");

          const items = await fs.readdir(full, {
            withFileTypes: true,
          });

          return (
            items
              .map((item) =>
                item.isDirectory()
                  ? `${item.name}/`
                  : item.name
              )
              .join("\n") || "(empty)"
          );
        }

        case "run_command": {
          const cwd = args.cwd
            ? resolvePath(args.cwd)
            : root;

          const command = String(
            args.command ?? ""
          ).trim();

          if (!command) {
            return "Error: command cannot be empty.";
          }

          if (!(await exists(cwd))) {
            return `Error: folder does not exist: ${cwd}`;
          }

          const cwdStat = await fs.stat(cwd);

          if (!cwdStat.isDirectory()) {
            return "Error: cwd must be a directory.";
          }

          await ensureAccess(cwd, "Run command");

          // Ordinary commands do not prompt.
          // Recognized destructive commands always prompt.
          if (requiresApproval(command)) {
            const decision = await permit({
              title: "Destructive command requires approval",
              detail:
                `Command:\n${command}\n\n` +
                `Working directory:\n${cwd}`,
              alwaysLabel: "Approve this command",
            });

            if (!decision) {
              return "User denied the destructive command.";
            }
          }

          const { stdout, stderr } = await execAsync(
            command,
            {
              cwd,
              timeout: 60_000,
              maxBuffer: 1024 * 1024,
              signal,
              windowsHide: true,
            }
          );

          return truncate(
            `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`
          );
        }

        case "search_files": {
          const query = String(args.query ?? "");
          const searchRoot = resolvePath(
            args.path || "."
          );

          await ensureAccess(searchRoot, "Search");

          if (!(await exists(searchRoot))) {
            return (
              `Error: folder does not exist: ${searchRoot}`
            );
          }

          const stat = await fs.stat(searchRoot);

          if (!stat.isDirectory()) {
            return "Error: search path must be a directory.";
          }

          const maxResults = Math.min(
            100,
            Math.max(
              1,
              Number.parseInt(args.max_results, 10) || 50
            )
          );

          return truncate(
            await searchFiles(
              searchRoot,
              query,
              maxResults
            )
          );
        }

        case "web_search": {
          return truncate(
            await webSearch(
              String(args.query ?? ""),
              { signal }
            )
          );
        }

        case "parse_json": {
          const input = String(args.json ?? "");

          try {
            const parsed = JSON.parse(input);

            return (
              "Valid JSON.\nParsed result:\n" +
              JSON.stringify(parsed, null, 2)
            );
          } catch (error) {
            return (
              "Invalid JSON.\n" +
              `Parsing error: ${error.message}\n` +
              "Check the JSON syntax, commas, quotes, " +
              "brackets, and trailing commas."
            );
          }
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      return (
        `Error: ${error.message}\n` +
        `${error.stdout ?? ""}\n` +
        `${error.stderr ?? ""}`
      );
    }
  }

  return {
    definitions: toolDefinitions,
    runTool,
  };
}
