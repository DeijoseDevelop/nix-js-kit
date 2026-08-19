import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { StructuredLogger, createRequestLogger } from "../src/runtime/logger.ts";

describe("structured logger (plan §12.3)", () => {
  it("generates a unique request ID", () => {
    const logger1 = new StructuredLogger();
    const logger2 = new StructuredLogger();
    assert.ok(logger1.getRequestId(), "should have a request ID");
    assert.ok(logger2.getRequestId(), "should have a request ID");
    assert.notEqual(logger1.getRequestId(), logger2.getRequestId(), "IDs should be unique");
  });

  it("uses provided request ID", () => {
    const logger = new StructuredLogger({ requestId: "test-123" });
    assert.equal(logger.getRequestId(), "test-123");
  });

  it("collects log entries", () => {
    const logger = new StructuredLogger({ minLevel: "debug" });
    logger.info("test message", { foo: "bar" });
    const entries = logger.getEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.level, "info");
    assert.equal(entries[0]!.message, "test message");
    assert.equal(entries[0]!.requestId, logger.getRequestId());
    assert.equal(entries[0]!.fields!.foo, "bar");
  });

  it("respects minimum log level", () => {
    const logger = new StructuredLogger({ minLevel: "warn" });
    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");
    const entries = logger.getEntries();
    assert.equal(entries.length, 2, "should only collect warn and error");
    assert.equal(entries[0]!.level, "warn");
    assert.equal(entries[1]!.level, "error");
  });

  it("redacts sensitive fields", () => {
    const logger = new StructuredLogger({ minLevel: "debug" });
    logger.info("request", {
      cookie: "session=abc123",
      authorization: "Bearer token",
      method: "GET",
      path: "/test",
    });
    const entry = logger.getEntries()[0]!;
    assert.equal(entry.fields!.cookie, "[REDACTED]");
    assert.equal(entry.fields!.authorization, "[REDACTED]");
    assert.equal(entry.fields!.method, "GET");
    assert.equal(entry.fields!.path, "/test");
  });

  it("redacts nested sensitive fields", () => {
    const logger = new StructuredLogger({ minLevel: "debug" });
    logger.info("nested", {
      headers: {
        cookie: "session=abc",
        "content-type": "application/json",
      },
    });
    const entry = logger.getEntries()[0]!;
    const headers = entry.fields!.headers as Record<string, unknown>;
    assert.equal(headers.cookie, "[REDACTED]");
    assert.equal(headers["content-type"], "application/json");
  });
});

describe("Server-Timing (plan §12.3)", () => {
  it("records timing metrics", () => {
    const logger = new StructuredLogger();
    logger.timing("db", 15.5, "database query");
    const header = logger.getServerTimingHeader();
    assert.ok(header.includes("db;dur=15.5"));
    assert.ok(header.includes('desc="database query"'));
  });

  it("startTimer records duration", async () => {
    const logger = new StructuredLogger();
    const stop = logger.startTimer("render", "page render");
    await new Promise((r) => setTimeout(r, 10));
    stop();
    const header = logger.getServerTimingHeader();
    assert.ok(header.includes("render;dur="), "should include render timing");
    assert.ok(header.includes('desc="page render"'));
  });

  it("multiple timings are joined with commas", () => {
    const logger = new StructuredLogger();
    logger.timing("a", 10);
    logger.timing("b", 20);
    const header = logger.getServerTimingHeader();
    assert.ok(header.includes("a;dur=10"));
    assert.ok(header.includes("b;dur=20"));
    assert.ok(header.includes(","));
  });
});

describe("createRequestLogger (plan §12.3)", () => {
  it("uses X-Request-ID from request header", () => {
    const request = new Request("http://localhost/", {
      headers: { "X-Request-ID": "req-from-header" },
    });
    const logger = createRequestLogger(request);
    assert.equal(logger.getRequestId(), "req-from-header");
  });

  it("generates a new ID when no header present", () => {
    const request = new Request("http://localhost/");
    const logger = createRequestLogger(request);
    assert.ok(logger.getRequestId(), "should have an ID");
    assert.notEqual(logger.getRequestId(), "null");
  });

  it("generates a new ID when no request", () => {
    const logger = createRequestLogger();
    assert.ok(logger.getRequestId());
  });
});
