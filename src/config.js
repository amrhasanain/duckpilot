// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ~/.duckpilot/config.json
export const CONFIG_DIR = path.join(os.homedir(), ".duckpilot");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  // mode 0o600: only the current user can read it (Linux/Mac)
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function saveApiKey(key) {
  saveConfig({ ...loadConfig(), apiKey: key });
}

// الأولوية: الـ config أولاً، وبعدها متغير البيئة
export function getApiKey() {
  return loadConfig().apiKey || process.env.GROQ_API_KEY || null;
}

export function maskKey(key) {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}