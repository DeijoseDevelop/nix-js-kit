import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSecurityHeaders,
  applySecurityHeaders,
  DEFAULT_SECURITY_HEADERS,
} from "../src/runtime/security-headers.ts";

describe("security headers (runtime-security §14)", () => {
  it("applies default headers when config is empty", () => {
    const headers = buildSecurityHeaders({}, false);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.equal(headers["X-Frame-Options"], "SAMEORIGIN");
  });

  it("returns empty map when config is false", () => {
    const headers = buildSecurityHeaders(false, false);
    assert.deepEqual(headers, {});
  });

  it("does not apply HSTS under HTTP by default", () => {
    const headers = buildSecurityHeaders({}, false);
    assert.ok(!headers["Strict-Transport-Security"], "HSTS should not be set under HTTP");
  });

  it("applies HSTS under HTTPS when hsts is true", () => {
    const headers = buildSecurityHeaders({ hsts: true }, true);
    assert.ok(headers["Strict-Transport-Security"], "HSTS should be set under HTTPS");
    assert.ok(headers["Strict-Transport-Security"]!.includes("max-age="));
  });

  it("applies HSTS as explicit string even under HTTP", () => {
    const headers = buildSecurityHeaders({ hsts: "max-age=31536000" }, false);
    assert.equal(headers["Strict-Transport-Security"], "max-age=31536000");
  });

  it("uses CSP when provided, replacing X-Frame-Options", () => {
    const headers = buildSecurityHeaders({
      contentSecurityPolicy: "default-src 'self'",
    }, false);
    assert.equal(headers["Content-Security-Policy"], "default-src 'self'");
    // When CSP is set, X-Frame-Options is not emitted (CSP frame-ancestors takes over).
    assert.ok(!headers["X-Frame-Options"], "X-Frame-Options should not be set when CSP is present");
  });

  it("injects nonce into CSP when 'nonce' placeholder is present", () => {
    const headers = buildSecurityHeaders({
      contentSecurityPolicy: "default-src 'self'; script-src 'nonce'",
    }, false, "abc123");
    assert.ok(
      headers["Content-Security-Policy"]!.includes("'nonce-abc123'"),
      "CSP should contain the injected nonce",
    );
  });

  it("applies Permissions-Policy when configured", () => {
    const headers = buildSecurityHeaders({
      permissionsPolicy: "camera=(), microphone=()",
    }, false);
    assert.equal(headers["Permissions-Policy"], "camera=(), microphone=()");
  });

  it("allows custom referrer policy", () => {
    const headers = buildSecurityHeaders({
      referrerPolicy: "no-referrer",
    }, false);
    assert.equal(headers["Referrer-Policy"], "no-referrer");
  });

  it("allows disabling noSniff", () => {
    const headers = buildSecurityHeaders({ noSniff: false }, false);
    assert.ok(!headers["X-Content-Type-Options"], "noSniff=false should not set X-Content-Type-Options");
  });

  it("applySecurityHeaders preserves existing response headers", () => {
    const response = new Response("ok", {
      headers: { "X-Custom": "custom", "X-Content-Type-Options": "custom-value" },
    });
    const result = applySecurityHeaders(response, { "X-Content-Type-Options": "nosniff" });
    // Existing header should NOT be overwritten.
    assert.equal(result.headers.get("X-Content-Type-Options"), "custom-value");
  });

  it("applySecurityHeaders adds new headers", () => {
    const response = new Response("ok");
    const result = applySecurityHeaders(response, {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    assert.equal(result.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(result.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  });

  it("applySecurityHeaders is a no-op when headers map is empty", () => {
    const response = new Response("ok", { headers: { "X-Custom": "val" } });
    const result = applySecurityHeaders(response, {});
    assert.equal(result.headers.get("X-Custom"), "val");
    assert.equal(result.status, 200);
  });

  it("DEFAULT_SECURITY_HEADERS has expected values", () => {
    assert.equal(DEFAULT_SECURITY_HEADERS.noSniff, true);
    assert.equal(DEFAULT_SECURITY_HEADERS.referrerPolicy, "strict-origin-when-cross-origin");
    assert.equal(DEFAULT_SECURITY_HEADERS.frameAncestors, "SAMEORIGIN");
  });
});
