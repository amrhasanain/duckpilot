#!/usr/bin/env node
// Copyright 2026 Amr Mohamed Hasanain
// Licensed under the Apache License, Version 2.0
import { main } from "../src/cli.js";
 
main(process.argv.slice(2)).catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
 