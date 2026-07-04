import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanRoutes } from "../src/router/route-scanner.ts";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(__dirname, "fixtures");

describe("scanRoutes", () => {
  it("discovers the home page", async () => {
    const routes = await scanRoutes(resolve(fixtures, "minimal/src/app"));
    const home = routes.pages.find((p) => p.path === "/");
    assert.ok(home, "home page should be found");
    assert.equal(home?.pagePath, resolve(fixtures, "minimal/src/app/page.ts"));
    assert.equal(home?.dataPath, resolve(fixtures, "minimal/src/app/page.data.ts"));
    assert.equal(home?.actionPath, resolve(fixtures, "minimal/src/app/page.action.ts"));
    assert.deepEqual(home?.layouts, [resolve(fixtures, "minimal/src/app/layout.ts")]);
  });

  it("discovers dynamic routes", async () => {
    const routes = await scanRoutes(resolve(fixtures, "minimal/src/app"));
    const blog = routes.pages.find((p) => p.path === "/blog/:slug");
    assert.ok(blog, "blog post route should be found");
    assert.equal(blog?.pagePath, resolve(fixtures, "minimal/src/app/blog/[slug]/page.ts"));
    assert.equal(blog?.dataPath, resolve(fixtures, "minimal/src/app/blog/[slug]/page.data.ts"));
  });

  it("discovers API routes", async () => {
    const routes = await scanRoutes(resolve(fixtures, "minimal/src/app"));
    const api = routes.api.find((r) => r.path === "/api/posts");
    assert.ok(api, "API route should be found");
    assert.equal(api?.routePath, resolve(fixtures, "minimal/src/app/api/posts/route.ts"));
  });

  it("discovers loading boundaries", async () => {
    const routes = await scanRoutes(resolve(fixtures, "minimal/src/app"));
    const home = routes.pages.find((p) => p.path === "/");
    assert.equal(home?.loadingPath, resolve(fixtures, "minimal/src/app/loading.ts"));
  });
});
