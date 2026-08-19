import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCachePolicy,
  shouldCachePublic,
  DEFAULT_CACHE_POLICY,
} from "../src/cache/policy.ts";

describe("cache policy (§9.1)", () => {
  it("returns default policy for missing input", () => {
    assert.deepEqual(normalizeCachePolicy(undefined), DEFAULT_CACHE_POLICY);
    assert.deepEqual(normalizeCachePolicy(null), DEFAULT_CACHE_POLICY);
    assert.deepEqual(normalizeCachePolicy("not-an-object"), DEFAULT_CACHE_POLICY);
  });

  it("returns default policy for invalid mode", () => {
    assert.deepEqual(normalizeCachePolicy({ mode: "invalid" }), DEFAULT_CACHE_POLICY);
  });

  it("normalizes a valid public policy", () => {
    const policy = normalizeCachePolicy({ mode: "public", revalidate: 60, tags: ["products"] });
    assert.equal(policy.mode, "public");
    assert.equal(policy.revalidate, 60);
    assert.deepEqual(policy.tags, ["products"]);
  });

  it("defaults revalidate to 0 when not a number", () => {
    const policy = normalizeCachePolicy({ mode: "public", revalidate: "not-a-number" });
    assert.equal(policy.revalidate, 0);
  });

  it("filters non-string tags", () => {
    const policy = normalizeCachePolicy({ mode: "public", revalidate: 60, tags: ["ok", 123, "also-ok"] });
    assert.deepEqual(policy.tags, ["ok", "also-ok"]);
  });

  it("shouldCachePublic: true for public mode with clean request", () => {
    const policy = { mode: "public" as const, revalidate: 60 };
    const request = new Request("http://localhost/");
    assert.equal(shouldCachePublic(policy, request), true);
  });

  it("shouldCachePublic: false for dynamic mode", () => {
    const policy = { mode: "dynamic" as const, revalidate: 60 };
    const request = new Request("http://localhost/");
    assert.equal(shouldCachePublic(policy, request), false);
  });

  it("shouldCachePublic: false for private mode", () => {
    const policy = { mode: "private" as const, revalidate: 60 };
    const request = new Request("http://localhost/");
    assert.equal(shouldCachePublic(policy, request), false);
  });

  it("shouldCachePublic: false when request has Cookie", () => {
    const policy = { mode: "public" as const, revalidate: 60 };
    const request = new Request("http://localhost/", {
      headers: { Cookie: "session=abc" },
    });
    assert.equal(shouldCachePublic(policy, request), false);
  });

  it("shouldCachePublic: false when request has Authorization", () => {
    const policy = { mode: "public" as const, revalidate: 60 };
    const request = new Request("http://localhost/", {
      headers: { Authorization: "Bearer token" },
    });
    assert.equal(shouldCachePublic(policy, request), false);
  });

  it("shouldCachePublic: false when revalidate is 0", () => {
    const policy = { mode: "public" as const, revalidate: 0 };
    const request = new Request("http://localhost/");
    assert.equal(shouldCachePublic(policy, request), false);
  });
});
