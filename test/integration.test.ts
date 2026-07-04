import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "../src/build/build.ts";
import { createSsrServer } from "../src/ssr/server.ts";
import { mkdir, rm, readFile } from "node:fs/promises";
import { getCachedHtml } from "../src/cache.ts";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "fixtures/minimal");
const appDir = resolve(root, "src/app");
const outDir = resolve(root, "dist");
const islandsDir = resolve(root, "src/islands");

describe("integration: build + SSR", () => {
  after(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("builds static pages from the fixture", async () => {
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    const result = await build({
      appDir,
      outDir,
      islandsDir,
      generatedEntry: resolve(root, ".nix-js/entry-client.ts"),
      hydrateImport: "../../../src/island/index.ts",
    });

    assert.equal(result.pages, 1, "should generate one static page (home)");
    assert.equal(result.files[0], resolve(outDir, "index.html"));

    const html = await readFile(resolve(outDir, "index.html"), "utf8");
    assert.ok(html.includes("<h1>Hello from test</h1>"), "should render loader data");
    assert.ok(html.includes('id="nix-js-data"'), "should serialize loader data");
  });

  it("serves SSR requests and actions", async () => {
    const server = await createSsrServer({
      appDir,
      publicDir: outDir,
      port: 0,
    });
    await server.listen();
    const { port } = server.server.address() as { port: number };

    try {
      const page = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(page.status, 200);
      const body = await page.text();
      assert.ok(body.includes("<h1>Hello from test</h1>"), "SSR should render home page");

      const action = await fetch(`http://127.0.0.1:${port}/__nix-js/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: "greet", page: "/", args: ["Ada"] }),
      });
      assert.equal(action.status, 200);
      assert.equal(await action.json(), "Hello, Ada!");

      const api = await fetch(`http://127.0.0.1:${port}/api/posts`);
      assert.equal(api.status, 200);
      assert.deepEqual(await api.json(), [{ id: 1, title: "Hello" }]);

      const apiPost = await fetch(`http://127.0.0.1:${port}/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New" }),
      });
      assert.equal(apiPost.status, 201);
      assert.deepEqual(await apiPost.json(), { id: 2, title: "New" });
    } finally {
      await server.close();
    }
  });

  it("caches pages with revalidate in ISR cache", async () => {
    const cacheDir = resolve(root, ".nix-js/cache");
    await rm(cacheDir, { recursive: true, force: true });
    const server = await createSsrServer({
      appDir,
      cacheDir,
      streaming: false,
      port: 0,
    });
    await server.listen();
    const { port } = server.server.address() as { port: number };

    try {
      const page = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(page.status, 200);
      const body = await page.text();
      assert.ok(body.includes("<h1>Hello from test</h1>"), "SSR should render home page");

      const cached = await getCachedHtml(cacheDir, "/");
      assert.ok(cached, "page should be cached");
      assert.ok(cached.html.includes("<h1>Hello from test</h1>"), "cached HTML should match");
      assert.equal(cached.revalidate, 60, "revalidate should be 60 seconds");
    } finally {
      await server.close();
    }
  });

  it("streams loading boundary and renders real content via endpoint", async () => {
    const server = await createSsrServer({
      appDir,
      streaming: true,
      port: 0,
    });
    await server.listen();
    const { port } = server.server.address() as { port: number };

    try {
      const page = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(page.status, 200);
      const body = await page.text();
      assert.ok(body.includes("<p>Loading...</p>"), "shell should render loading boundary");
      assert.ok(body.includes("__nixJsStreamRender"), "shell should include streaming script");

      const render = await fetch(`http://127.0.0.1:${port}/__nix-js/render?page=%2F&search=`);
      assert.equal(render.status, 200);
      const renderedBody = await render.text();
      assert.ok(renderedBody.includes("<h1>Hello from test</h1>"), "render endpoint should return real content");
    } finally {
      await server.close();
    }
  });
});
