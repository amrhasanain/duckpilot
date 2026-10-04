// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import path from "node:path";

const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);

// true if target is the same as base or inside it (case-insensitive on Windows)
export function isInside(base, target) {
  const b = norm(path.resolve(base));
  const t = norm(path.resolve(target));
  if (t === b) return true;
  return t.startsWith(b.endsWith(path.sep) ? b : b + path.sep);
}

export function truncate(s, n = 8000) {
  return s.length > n ? s.slice(0, n) + "\n...[truncated]" : s;
}