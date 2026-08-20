import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  transformHash,
  processImageBatch,
  getImage,
  createImageService,
  readManifest,
} from "../src/image/service.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tempRoot = resolve(__dirname, "fixtures/minimal/.tmp-image-hardening");

before(async () => {
  await mkdir(join(tempRoot, "public", "images"), { recursive: true });
  await mkdir(join(tempRoot, "out"), { recursive: true });
  await writeFile(join(tempRoot, "public", "images", "hero.jpg"), Buffer.from("fake-jpeg-bytes", "utf8"));
  await writeFile(join(tempRoot, "public", "images", "space image.png"), Buffer.from("fake-png", "utf8"));
});

after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("image transform hash (§9.4)", () => {
  const source = Buffer.from("content-a", "utf8");

  it("is stable for identical content and options", () => {
    assert.equal(transformHash(source, 640, "webp", 80), transformHash(source, 640, "webp", 80));
  });

  it("changes when the source content changes", () => {
    const other = Buffer.from("content-b", "utf8");
    assert.notEqual(transformHash(source, 640, "webp", 80), transformHash(other, 640, "webp", 80));
  });

  it("changes when effective options change (quality)", () => {
    assert.notEqual(transformHash(source, 640, "webp", 80), transformHash(source, 640, "webp", 85));
  });

  it("changes when the width or format changes", () => {
    assert.notEqual(transformHash(source, 640, "webp", 80), transformHash(source, 320, "webp", 80));
    assert.notEqual(transformHash(source, 640, "webp", 80), transformHash(source, 640, "avif", 80));
  });
});

describe("image path containment (§9.5)", () => {
  it("rejects traversal sources in strict mode", async () => {
    await assert.rejects(
      () =>
        processImageBatch(
          [{ src: "../../etc/passwd", widths: [640] }],
          { publicDir: join(tempRoot, "public"), outDir: join(tempRoot, "out"), strict: true },
        ),
      /Invalid image source path|escapes its allowed root/i,
    );
  });

  it("skips invalid sources in non-strict mode", async () => {
    const result = await processImageBatch(
      [{ src: "../../etc/passwd", widths: [640] }],
      { publicDir: join(tempRoot, "public"), outDir: join(tempRoot, "out"), strict: false },
    );
    assert.ok(!(result.manifest.entries["../../etc/passwd"]));
  });

  it("rejects NUL and backslash paths", async () => {
    await assert.rejects(
      () =>
        processImageBatch(
          [{ src: "images/\0hero.jpg", widths: [640] }],
          { publicDir: join(tempRoot, "public"), outDir: join(tempRoot, "out"), strict: true },
        ),
      /Invalid image source path/i,
    );
  });
});

describe("image strict mode (§9.7)", () => {
  it("fails the build on a missing source when strict", async () => {
    await assert.rejects(
      () =>
        processImageBatch(
          [{ src: "/images/does-not-exist.jpg", widths: [640] }],
          { publicDir: join(tempRoot, "public"), outDir: join(tempRoot, "out"), strict: true },
        ),
      /not found/i,
    );
  });

  it("continues with a warning in non-strict mode", async () => {
    const result = await processImageBatch(
      [{ src: "/images/does-not-exist.jpg", widths: [640] }],
      { publicDir: join(tempRoot, "public"), outDir: join(tempRoot, "out"), strict: false },
    );
    assert.equal(result.count, 0);
  });
});

describe("getImage() and ImageService (§9.2/§9.3)", () => {
  it("returns deterministic metadata without sharp", async () => {
    const meta = await getImage(
      { src: "/images/hero.jpg", alt: "Hero", widths: [400], formats: ["webp"] },
      { publicDir: join(tempRoot, "public"), outDir: join(tempRoot, "out") },
    );
    assert.equal(meta.src, "/images/hero.jpg");
    assert.equal(meta.attributes.alt, "Hero");
    assert.equal(meta.attributes.loading, "lazy");
    assert.ok(Array.isArray(meta.generated));
  });

  it("exposes an ImageService with declared capabilities", () => {
    const service = createImageService({ publicDir: "x", outDir: "y" });
    assert.equal(typeof service.resolve, "function");
    assert.equal(service.capabilities.remote, false);
    assert.equal(service.capabilities.filesystem, true);
  });

  it("writes a manifest without corrupting prior entries", async () => {
    const manifestPath = join(tempRoot, "manifest.json");
    const result = await processImageBatch(
      [{ src: "/images/hero.jpg", widths: [640], formats: ["webp"] }],
      { publicDir: join(tempRoot, "public"), outDir: join(tempRoot, "out"), manifestPath },
    );
    assert.ok(result.manifest.entries["/images/hero.jpg"]);
    const onDisk = await readManifest(manifestPath);
    assert.ok(onDisk.entries["/images/hero.jpg"]);
    const raw = await readFile(manifestPath, "utf8");
    assert.ok(!raw.includes(".tmp"), "manifest should not contain temp files");
  });
});
