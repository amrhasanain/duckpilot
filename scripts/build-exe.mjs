// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0

// Builds a standalone executable (Node SEA): dist/duckpilot.exe on Windows, dist/duckpilot elsewhere.
// Usage: npm run build:exe

import fs from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { build } from "esbuild";

const SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const exe = process.platform === "win32" ? "dist/duckpilot.exe" : "dist/duckpilot";

const step = (msg) => console.log(`\n▸ ${msg}`);
const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// 1) bundle everything into one CommonJS file
step("Bundling with esbuild");
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist");
await build({
  entryPoints: ["bin/duckpilot.js"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: "dist/duckpilot.cjs",
  define: {
    __DUCKPILOT_VERSION__: JSON.stringify(version),
    "import.meta.url": "undefined",
  },
  logLevel: "warning",
});

// 2) create the SEA blob
step("Creating the SEA blob");
fs.writeFileSync(
  "dist/sea-config.json",
  JSON.stringify({
    main: "dist/duckpilot.cjs",
    output: "dist/sea-prep.blob",
    disableExperimentalSEAWarning: true,
  })
);
execFileSync(process.execPath, ["--experimental-sea-config", "dist/sea-config.json"], {
  stdio: "inherit",
});

// 3) copy node and inject the blob
step(`Copying node to ${exe}`);
fs.copyFileSync(process.execPath, exe);
if (!fs.existsSync(exe)) {
  fail(
    `${exe} disappeared right after copying. Your antivirus probably removed it.\n` +
      "  Add this project's dist folder to the antivirus exclusions and run again."
  );
}

step("Injecting the blob");
const machoFlag = process.platform === "darwin" ? " --macho-segment-name NODE_SEA" : "";
execSync(`npx postject "${exe}" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse ${SENTINEL}${machoFlag}`, {
  stdio: "inherit",
});

if (!fs.existsSync(exe)) {
  fail(`${exe} is missing after injection. Check your antivirus (it may have quarantined it).`);
}

const mb = (fs.statSync(exe).size / 1024 / 1024).toFixed(0);
console.log(`\n✓ Built ${exe} (${mb} MB)`);
console.log(`  Try it:  ${process.platform === "win32" ? ".\\dist\\duckpilot.exe" : "./dist/duckpilot"} --help`);
