import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "../src/build/build.ts";
import { nodeAdapter } from "../src/adapters/node.ts";
import { bunAdapter } from "../src/adapters/bun.ts";
import { vercelAdapter } from "../src/adapters/vercel.ts";
import { netlifyAdapter } from "../src/adapters/netlify.ts";
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

async function buildFixture(): Promise<void> {
  await rm(outDir, { recursive: true, force: true });
  await build({
    appDir,
    outDir,
    islandsDir,
    generatedEntry: resolve(generatedDir, "entry-client.ts"),
    hydrateImport: "../../../src/island/index.ts",
  });
}

describe("adapters", () => {
  after(async () => {
    await rm(outDir, { recursive: true, force: true });
    await rm(generatedDir, { recursive: true, force: true });
    await rm(resolve(root, ".vercel"), { recursive: true, force: true });
    await rm(resolve(root, "netlify"), { recursive: true, force: true });
    await rm(resolve(root, "netlify.toml"), { force: true });
  });

  it("builds and serves with Node adapter", async () => {
    await buildFixture();
    await nodeAdapter.build({
      root,
      appDir: "src/app",
      outDir: "dist",
      islandsDir: "src/islands",
      clientEntry: "/_nix-js/entry-client.js",
      lang: "es",
      hydrateImport: "../../../src/island/index.ts",
    });

    const serverPath = resolve(generatedDir, "node-server.mjs");
    await stat(serverPath);

    const child = spawn("node", [serverPath], { cwd: root, env: { ...process.env, PORT: "3461" } });
    try {
      await waitForServer("http://127.0.0.1:3461/");
      const res = await fetch("http://127.0.0.1:3461/");
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes("<h1>Hello from test</h1>"), "Node adapter should SSR home page");
    } finally {
      child.kill();
    }
  });

  it("builds and serves with Bun adapter", async () => {
    await buildFixture();
    await bunAdapter.build({
      root,
      appDir: "src/app",
      outDir: "dist",
      islandsDir: "src/islands",
      clientEntry: "/_nix-js/entry-client.js",
      lang: "es",
      hydrateImport: "../../../src/island/index.ts",
    });

    const serverPath = resolve(generatedDir, "bun-server.ts");
    await stat(serverPath);

    const child = spawn("bun", [serverPath], { cwd: root, env: { ...process.env, PORT: "3462" } });
    try {
      await waitForServer("http://127.0.0.1:3462/");
      const res = await fetch("http://127.0.0.1:3462/");
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes("<h1>Hello from test</h1>"), "Bun adapter should SSR home page");
    } finally {
      child.kill();
    }
  });

  it("builds Vercel handler and serves SSR", async () => {
    await buildFixture();
    await vercelAdapter.build({
      root,
      appDir: "src/app",
      outDir: "dist",
      islandsDir: "src/islands",
      clientEntry: "/_nix-js/entry-client.js",
      lang: "es",
      hydrateImport: "../../../src/island/index.ts",
    });

    const handlerPath = resolve(root, ".vercel/output/functions/__nix-js-kit.func/index.js");
    await stat(handlerPath);

    const { default: handler } = await import(handlerPath);
    const response = await handler(new Request("http://localhost/"));
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes("<h1>Hello from test</h1>"), "Vercel handler should SSR home page");
  });

  it("builds Netlify handler and serves SSR", async () => {
    await buildFixture();
    await netlifyAdapter.build({
      root,
      appDir: "src/app",
      outDir: "dist",
      islandsDir: "src/islands",
      clientEntry: "/_nix-js/entry-client.js",
      lang: "es",
      hydrateImport: "../../../src/island/index.ts",
    });

    const handlerPath = resolve(root, "netlify/functions/__nix-js-kit.mjs");
    await stat(handlerPath);

    const { default: handler } = await import(handlerPath);
    const response = await handler(new Request("http://localhost/"));
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes("<h1>Hello from test</h1>"), "Netlify handler should SSR home page");
  });
});
