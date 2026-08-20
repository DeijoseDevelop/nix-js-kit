import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CAPABILITIES,
  SERVERLESS_CAPABILITIES,
  EDGE_CAPABILITIES,
  createCapabilities,
  supportsStreaming,
  supportsPersistentStorage,
  supportsWritableFilesystem,
  validateCapabilities,
} from "../src/runtime/capabilities.ts";

describe("adapter capabilities (§8.5)", () => {
  it("provides sensible defaults for full hosts", () => {
    assert.equal(DEFAULT_CAPABILITIES.streaming, true);
    assert.equal(DEFAULT_CAPABILITIES.filesystem, "persistent");
    assert.equal(DEFAULT_CAPABILITIES.imageRuntime, true);
    assert.equal(DEFAULT_CAPABILITIES.backgroundWork, true);
  });

  it("declares stateless serverless capabilities", () => {
    assert.equal(SERVERLESS_CAPABILITIES.filesystem, "ephemeral");
    assert.equal(SERVERLESS_CAPABILITIES.imageRuntime, false);
    assert.equal(SERVERLESS_CAPABILITIES.backgroundWork, false);
    assert.ok(SERVERLESS_CAPABILITIES.maxBodySize);
  });

  it("declares edge read-only capabilities", () => {
    assert.equal(EDGE_CAPABILITIES.filesystem, "readonly");
    assert.equal(EDGE_CAPABILITIES.backgroundWork, false);
  });

  it("supportsStreaming respects the streaming flag", () => {
    assert.equal(supportsStreaming({ streaming: true }), true);
    assert.equal(supportsStreaming({ streaming: false }), false);
  });

  it("persistent storage requires filesystem=persistent", () => {
    assert.equal(supportsPersistentStorage({ filesystem: "persistent" }), true);
    assert.equal(supportsPersistentStorage({ filesystem: "ephemeral" }), false);
    assert.equal(supportsWritableFilesystem({ filesystem: "ephemeral" }), true);
    assert.equal(supportsWritableFilesystem({ filesystem: "none" }), false);
  });

  it("flags ISR on non-persistent hosts", () => {
    const result = validateCapabilities(SERVERLESS_CAPABILITIES, { isr: true });
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((p) => p.includes("ISR")));
  });

  it("accepts a persistent host with ISR", () => {
    const result = validateCapabilities(DEFAULT_CAPABILITIES, { isr: true });
    assert.equal(result.ok, true);
  });

  it("flags image transforms without runtime or filesystem", () => {
    const result = validateCapabilities(
      { streaming: true, filesystem: "none", imageRuntime: false, backgroundWork: false },
      { images: true },
    );
    assert.equal(result.ok, false);
  });

  it("flags streaming=false when streaming is requested", () => {
    const result = validateCapabilities(
      { streaming: false, filesystem: "persistent", imageRuntime: true, backgroundWork: true },
      { streaming: true },
    );
    assert.equal(result.ok, false);
  });

  it("createCapabilities merges overrides", () => {
    const caps = createCapabilities({ filesystem: "readonly", imageRuntime: false });
    assert.equal(caps.filesystem, "readonly");
    assert.equal(caps.imageRuntime, false);
    assert.equal(caps.streaming, true);
  });
});
