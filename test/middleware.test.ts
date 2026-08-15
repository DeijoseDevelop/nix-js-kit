import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesMiddleware, runMiddleware, type LoadedMiddleware } from "../src/middleware/index.ts";

describe("matchesMiddleware", () => {
  it("matches everything when no matcher is configured", () => {
    assert.equal(matchesMiddleware("/any/path", {}), true);
    assert.equal(matchesMiddleware("/", {}), true);
  });

  it("matches exact static paths", () => {
    const config = { matcher: ["/dashboard"] };
    assert.equal(matchesMiddleware("/dashboard", config), true);
    assert.equal(matchesMiddleware("/dashboard/settings", config), false);
    assert.equal(matchesMiddleware("/about", config), false);
  });

  it("matches dynamic segments with :param*", () => {
    const config = { matcher: ["/dashboard/:path*"] };
    assert.equal(matchesMiddleware("/dashboard", config), true);
    assert.equal(matchesMiddleware("/dashboard/settings", config), true);
    assert.equal(matchesMiddleware("/dashboard/users/123", config), true);
    assert.equal(matchesMiddleware("/about", config), false);
  });

  it("matches dynamic segments with :param", () => {
    const config = { matcher: ["/blog/:slug"] };
    assert.equal(matchesMiddleware("/blog/hello", config), true);
    assert.equal(matchesMiddleware("/blog", config), false);
    assert.equal(matchesMiddleware("/blog/hello/comments", config), false);
  });

  it("matches multiple patterns", () => {
    const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };
    assert.equal(matchesMiddleware("/dashboard", config), true);
    assert.equal(matchesMiddleware("/admin/users", config), true);
    assert.equal(matchesMiddleware("/blog", config), false);
  });
});

describe("runMiddleware", () => {
  it("continues when middleware returns undefined", async () => {
    const mw: LoadedMiddleware = {
      handler: () => undefined,
      config: {},
    };
    const request = new Request("http://localhost/dashboard");
    const result = await runMiddleware(mw, request);
    assert.equal(result.kind, "continue");
  });

  it("short-circuits when middleware returns a Response", async () => {
    const mw: LoadedMiddleware = {
      handler: (req) => Response.redirect(new URL("/login", req.url), 307),
      config: {},
    };
    const request = new Request("http://localhost/dashboard");
    const result = await runMiddleware(mw, request);
    assert.equal(result.kind, "response");
    assert.equal(result.response.status, 307);
    assert.equal(result.response.headers.get("Location"), "http://localhost/login");
  });

  it("returns 401 when middleware returns a 401 Response", async () => {
    const mw: LoadedMiddleware = {
      handler: () => new Response("Unauthorized", { status: 401 }),
      config: {},
    };
    const request = new Request("http://localhost/secret");
    const result = await runMiddleware(mw, request);
    assert.equal(result.kind, "response");
    assert.equal(result.response.status, 401);
  });

  it("supports async middleware", async () => {
    const mw: LoadedMiddleware = {
      handler: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return new Response("OK", { status: 200 });
      },
      config: {},
    };
    const request = new Request("http://localhost/");
    const result = await runMiddleware(mw, request);
    assert.equal(result.kind, "response");
    assert.equal(result.response.status, 200);
  });

  it("passes params via context", async () => {
    const mw: LoadedMiddleware = {
      handler: (_req, ctx) => {
        if (ctx.params?.slug === "blocked") {
          return new Response("Blocked", { status: 403 });
        }
      },
      config: {},
    };
    const request = new Request("http://localhost/blog/blocked");
    const result = await runMiddleware(mw, request, { slug: "blocked" });
    assert.equal(result.kind, "response");
    assert.equal(result.response.status, 403);
  });

  it("next() passes headers to continue", async () => {
    const mw: LoadedMiddleware = {
      handler: (_req, ctx) => {
        ctx.next({ headers: { "x-custom": "value" } });
      },
      config: {},
    };
    const request = new Request("http://localhost/");
    const result = await runMiddleware(mw, request);
    assert.equal(result.kind, "continue");
    assert.deepEqual(result.headers, { "x-custom": "value" });
  });
});
