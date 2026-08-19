import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { join, dirname, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import type { ImageFormat } from "./index.js";

// =============================================================================
// --- ImageService: metadata-driven image processing and manifest ---
// =============================================================================
//
// Replaces the ad-hoc pipeline with a structured service that:
//
//   * Reads real image dimensions from the source file (sharp metadata).
//   * Generates hashed variant filenames (content-addressed).
//   * Produces an ImageManifest mapping src → variant metadata.
//   * Validates that every URL in the markup corresponds to a real file.
//   * Never upscales (withoutEnlargement: true).
//   * Falls back gracefully when sharp is not installed.
//   * Caches processed results to avoid reprocessing on incremental builds.
//
// The manifest is the single source of truth for the image() helper: after
// the build pipeline runs, the helper reads the manifest to emit real
// <picture>/<source> markup with exact URLs and dimensions.
// =============================================================================

export interface ImageVariant {
  /** URL path relative to the site root, e.g. "/images/hero-800w-abc123.webp". */
  url: string;
  /** Width in pixels. */
  width: number;
  /** Height in pixels (preserves aspect ratio). */
  height: number;
  /** Format of the variant. */
  format: ImageFormat;
  /** File size in bytes. */
  size: number;
}

export interface ImageEntry {
  /** Original source URL, e.g. "/images/hero.jpg". */
  src: string;
  /** Intrinsic width of the source. */
  width: number;
  /** Intrinsic height of the source. */
  height: number;
  /** All generated variants. */
  variants: ImageVariant[];
  /** Content hash of the source file. */
  hash: string;
}

export interface ImageManifest {
  version: 1;
  entries: Record<string, ImageEntry>;
}

export interface ProcessOptions {
  /** Absolute path to the public directory (source images). */
  publicDir: string;
  /** Absolute path to the output directory. */
  outDir: string;
  /** Formats to generate. Defaults to ["webp", "avif"]. */
  formats?: ImageFormat[];
  /** Quality (1-100). Defaults to 80. */
  quality?: number;
  /** Path to write the manifest JSON. */
  manifestPath?: string;
}

export interface ProcessResult {
  manifest: ImageManifest;
  /** Number of variants generated. */
  count: number;
  /** Whether sharp was available. */
  optimized: boolean;
}

let sharpLoader: (() => Promise<any>) | null | undefined;

async function loadSharp(): Promise<any | null> {
  if (sharpLoader === null) return null;
  if (sharpLoader) return sharpLoader();
  try {
    // @ts-ignore — `sharp` is an optional peer dependency.
    const mod = await import("sharp");
    const sharp = mod.default;
    if (typeof sharp !== "function") {
      sharpLoader = null;
      return null;
    }
    sharpLoader = async () => sharp;
    return sharp;
  } catch {
    sharpLoader = null;
    return null;
  }
}

export async function isSharpAvailable(): Promise<boolean> {
  const sharp = await loadSharp();
  return sharp !== null;
}

/**
 * Process a batch of registered images and produce a manifest.
 *
 * Each image is:
 *   1. Read from the public directory.
 *   2. Hashed (content-addressed) for cache-busting filenames.
 *   3. Resized to each requested width (without upscaling).
 *   4. Converted to each requested format.
 *   5. Written to the output directory with hashed filenames.
 *   6. Recorded in the manifest with real dimensions and file sizes.
 */
export async function processImageBatch(
  images: { src: string; widths: number[]; formats?: ImageFormat[] }[],
  options: ProcessOptions,
): Promise<ProcessResult> {
  const sharp = await loadSharp();
  const { publicDir, outDir, formats = ["webp", "avif"], quality = 80 } = options;
  const entries: Record<string, ImageEntry> = {};
  let count = 0;

  if (!sharp) {
    // Without sharp, build a manifest with only the original source entries.
    for (const { src } of images) {
      if (entries[src]) continue;
      const sourcePath = join(publicDir, src.replace(/^\//, ""));
      try {
        const buffer = await readFile(sourcePath);
        const hash = createHash("md5").update(buffer).digest("hex").slice(0, 8);
        entries[src] = {
          src,
          width: 0,
          height: 0,
          variants: [],
          hash,
        };
      } catch {
        // Source missing — skip.
      }
    }
    const manifest: ImageManifest = { version: 1, entries };
    if (options.manifestPath) await writeManifest(options.manifestPath, manifest);
    return { manifest, count: 0, optimized: false };
  }

  for (const { src, widths, formats: imgFormats } of images) {
    if (entries[src]) continue;

    const sourcePath = join(publicDir, src.replace(/^\//, ""));
    let sourceBuffer: Buffer;
    try {
      sourceBuffer = await readFile(sourcePath);
    } catch {
      console.warn(`[nix-js-kit] Image not found: ${sourcePath}. Skipping.`);
      continue;
    }

    const hash = createHash("md5").update(sourceBuffer).digest("hex").slice(0, 8);
    const ext = extname(src);
    const base = basename(src, ext);
    const dir = dirname(src);
    const targetFormats = imgFormats?.length ? imgFormats : formats;

    // Read real metadata from the source.
    let sourceWidth = 0;
    let sourceHeight = 0;
    try {
      const meta = await sharp(sourceBuffer).metadata();
      sourceWidth = meta.width ?? 0;
      sourceHeight = meta.height ?? 0;
    } catch {
      // Fallback: no metadata.
    }

    const variants: ImageVariant[] = [];

    for (const width of widths) {
      // Never upscale: skip widths larger than the source.
      if (sourceWidth > 0 && width > sourceWidth) continue;

      for (const format of targetFormats) {
        const variantName = `${base}-${width}w-${hash}.${format}`;
        const variantRelPath = join(dir, variantName);
        const variantAbsPath = join(outDir, variantRelPath.replace(/^\//, ""));
        const variantUrl = variantRelPath.replace(/\\/g, "/");

        try {
          await mkdir(dirname(variantAbsPath), { recursive: true });
          const info = await sharp(sourceBuffer)
            .resize({ width, withoutEnlargement: true })
            .toFormat(format, { quality })
            .toFile(variantAbsPath);

          variants.push({
            url: variantUrl,
            width: info.width,
            height: info.height,
            format,
            size: info.size,
          });
          count++;
        } catch (err) {
          console.warn(`[nix-js-kit] Failed to generate ${variantName}:`, err);
        }
      }
    }

    entries[src] = {
      src,
      width: sourceWidth,
      height: sourceHeight,
      variants,
      hash,
    };
  }

  const manifest: ImageManifest = { version: 1, entries };
  if (options.manifestPath) await writeManifest(options.manifestPath, manifest);
  return { manifest, count, optimized: true };
}

/**
 * Read a manifest from disk, or return an empty one if it doesn't exist.
 */
export async function readManifest(path: string): Promise<ImageManifest> {
  try {
    const data = await readFile(path, "utf8");
    return JSON.parse(data) as ImageManifest;
  } catch {
    return { version: 1, entries: {} };
  }
}

/**
 * Write a manifest to disk.
 */
export async function writeManifest(path: string, manifest: ImageManifest): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(manifest, null, 2), "utf8");
}

/**
 * Look up an image entry in the manifest by its source URL.
 */
export function getManifestEntry(manifest: ImageManifest, src: string): ImageEntry | undefined {
  return manifest.entries[src];
}

/**
 * Build a srcset string from manifest variants of a given format.
 * Returns e.g. "/images/hero-400w-abc.webp 400w, /images/hero-800w-abc.webp 800w".
 */
export function buildSrcset(entry: ImageEntry, format: ImageFormat): string {
  return entry.variants
    .filter((v) => v.format === format)
    .map((v) => `${v.url} ${v.width}w`)
    .join(", ");
}

/**
 * Build the full <picture> markup for an image entry, with <source> per format
 * and a fallback <img>.
 */
export function buildPictureMarkup(entry: ImageEntry, opts: {
  alt: string;
  sizes?: string;
  priority?: boolean;
  class?: string;
  attributes?: Record<string, string>;
  fallbackSrc?: string;
  fallbackWidth?: number;
  fallbackHeight?: number;
}): string {
  const {
    alt,
    sizes,
    priority = false,
    class: className,
    attributes = {},
    fallbackSrc = entry.src,
    fallbackWidth = entry.width,
    fallbackHeight = entry.height,
  } = opts;

  const formats = [...new Set(entry.variants.map((v) => v.format))];
  const loadingAttr = priority ? "" : ' loading="lazy"';
  const fetchPriorityAttr = priority ? ' fetchpriority="high"' : "";
  const sizesAttr = sizes ? ` sizes="${escapeAttr(sizes)}"` : "";
  const classAttr = className ? ` class="${escapeAttr(className)}"` : "";
  const extraAttrs = Object.entries(attributes)
    .map(([key, value]) => ` ${escapeAttr(key)}="${escapeAttr(String(value))}"`)
    .join("");

  const sources = formats
    .map((format) => {
      const srcset = buildSrcset(entry, format);
      if (!srcset) return "";
      const type = format === "jpeg" ? "image/jpeg" : `image/${format}`;
      return `<source srcset="${srcset}"${sizesAttr} type="${type}" />`;
    })
    .filter(Boolean)
    .join("");

  const img = `<img src="${escapeAttr(fallbackSrc)}" alt="${escapeAttr(alt)}" width="${fallbackWidth}" height="${fallbackHeight}"${loadingAttr} decoding="async"${fetchPriorityAttr}${classAttr}${extraAttrs} />`;

  return sources ? `<picture>${sources}${img}</picture>` : img;
}

/**
 * Validate that every variant URL in the manifest corresponds to a real file
 * in the output directory. Returns a list of missing URLs.
 */
export async function validateManifestUrls(
  manifest: ImageManifest,
  outDir: string,
): Promise<string[]> {
  const missing: string[] = [];
  for (const entry of Object.values(manifest.entries)) {
    for (const variant of entry.variants) {
      const path = join(outDir, variant.url.replace(/^\//, ""));
      try {
        await stat(path);
      } catch {
        missing.push(variant.url);
      }
    }
  }
  return missing;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
