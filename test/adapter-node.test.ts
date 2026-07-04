import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "../src/build/build.ts";
import { nodeAdapter } from "../src/adapters/node.ts";
import { rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "fixtures/minimal");
const appDir = resolve(root, "src/app");
const outDir = resolve(root, "dist");
const islandsDir = resolve(root, "src/islands");
const generatedDir = resolve(root, ".nix-js");

function waitForServer(url: string, timeout = 10000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    async function tryConnect() {
      try {
        const res = await fetch(url);
        if (res.status === 200) {
          resolve();
          return;
        }
      } catch {
        // ignore
      }
      if (Date.now() - start > timeout) {
        reject(new Error(`Server did not start at ${url}`));
        return;
      }
      setTimeout(tryConnect, 100);
    }
    tryConnect();
  });
}

describe("adapter: node", () => {
  after(async () => {
    await rm(outDir, { recursive: true, force: true });
    await rm(generatedDir, { recursive: true, force: true });
  });

  it("builds a self-contained Node server and serves SSR", async () => {
    await rm(outDir, { recursive: true, force: true });
    await rm(generatedDir, { recursive: true, force: true });

    await build({
      appDir,
      outDir,
      islandsDir,
      generatedEntry: resolve(generatedDir, "entry-client.ts"),
      hydrateImport: "../../../src/island/index.ts",
    });

    await nodeAdapter.build({
      root,
      appDir: "src/app",
      outDir: "dist",
      islandsDir: "src/islands",
      generatedEntry: ".nix-js/entry-client.ts",
      clientEntry: "/_nix-js/entry-client.js",
      lang: "es",
      hydrateImport: "../../../src/island/index.ts",
    });

    const serverPath = resolve(generatedDir, "node-server.mjs");
    await stat(serverPath);

    const child = spawn("node", [serverPath], { cwd: root, env: { ...process.env, PORT: "3459" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    try {
      await waitForServer("http://127.0.0.1:3459/");
      const res = await fetch("http://127.0.0.1:3459/");
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes("<h1>Hello from test</h1>"), "Node adapter should SSR home page");
    } finally {
      child.kill();
    }
  });
});
