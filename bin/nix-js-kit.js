#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Register tsx so dynamic imports of user .ts pages/islands work at runtime.
const tsx = await import("tsx/esm/api").catch(() => null);
if (tsx) tsx.register();

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, "../dist/lib/cli.js");

if (!existsSync(built)) {
  console.log("[nix-js-kit] dist/lib/cli.js not found, running npm run build:lib...");
  const result = spawnSync("npm", ["run", "build:lib"], {
    stdio: "inherit",
    cwd: join(here, ".."),
  });
  if (result.status !== 0) {
    console.error("[nix-js-kit] build:lib failed");
    process.exit(result.status ?? 1);
  }
}

const { run } = await import(built);

run(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
