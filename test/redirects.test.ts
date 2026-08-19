import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchRedirect, matchRewrite, matchRouteHeaders } from "../src/router/redirects.ts";

describe("redirects (plan §11.1, §10)", () => {
  it("matches a static redirect", () => {
    const response = matchRedirect("/old", [{ from: "/old", to: "/new", status: 301 }]);
    assert.ok(response);
    assert.equal(response!.status, 301);
    assert.equal(response!.headers.get("Location"), "/new");
  });

  it("matches a dynamic redirect with :param", () => {
    const response = matchRedirect("/old-blog/hello", [
      { from: "/old-blog/:slug", to: "/blog/:slug", status: 301 },
    ]);
    assert.ok(response);
    assert.equal(response!.status, 301);
    assert.equal(response!.headers.get("Location"), "/blog/hello");
  });

  it("defaults to 308 when status is not specified", () => {
    const response = matchRedirect("/old", [{ from: "/old", to: "/new" }]);
    assert.ok(response);
    assert.equal(response!.status, 308);
  });

  it("returns undefined when no rule matches", () => {
    const response = matchRedirect("/other", [{ from: "/old", to: "/new" }]);
    assert.equal(response, undefined);
  });

  it("matches wildcard patterns", () => {
    const response = matchRedirect("/legacy/post/123", [
      { from: "/legacy/*", to: "/new", status: 302 },
    ]);
    assert.ok(response);
    assert.equal(response!.status, 302);
    assert.equal(response!.headers.get("Location"), "/new");
  });
});

describe("rewrites (plan §11.1)", () => {
  it("matches a static rewrite", () => {
    const result = matchRewrite("/old", [{ from: "/old", to: "/new" }]);
    assert.equal(result, "/new");
  });

  it("matches a dynamic rewrite with :param", () => {
    const result = matchRewrite("/api/v1/users", [
      { from: "/api/v1/:resource", to: "/api/v2/:resource" },
    ]);
    assert.equal(result, "/api/v2/users");
  });

  it("returns undefined when no rule matches", () => {
    const result = matchRewrite("/other", [{ from: "/old", to: "/new" }]);
    assert.equal(result, undefined);
  });

  it("matches catch-all rewrite", () => {
    const result = matchRewrite("/api/legacy/users/123", [
      { from: "/api/legacy/:path*", to: "/api/v2/:path*" },
    ]);
    assert.equal(result, "/api/v2/users/123");
  });
});

describe("route headers (plan §11.1)", () => {
  it("matches a static path", () => {
    const headers = matchRouteHeaders("/admin", [
      { path: "/admin", headers: { "X-Robots-Tag": "noindex" } },
    ]);
    assert.deepEqual(headers, { "X-Robots-Tag": "noindex" });
  });

  it("matches a wildcard path", () => {
    const headers = matchRouteHeaders("/admin/users", [
      { path: "/admin/*", headers: { "X-Robots-Tag": "noindex" } },
    ]);
    assert.deepEqual(headers, { "X-Robots-Tag": "noindex" });
  });

  it("returns undefined when no rule matches", () => {
    const headers = matchRouteHeaders("/public", [
      { path: "/admin/*", headers: { "X-Robots-Tag": "noindex" } },
    ]);
    assert.equal(headers, undefined);
  });
});
