import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface CacheEntry {
  html: string;
  generatedAt: number;
  revalidate: number;
}

export interface CacheOptions {
  cacheDir: string;
  defaultRevalidate?: number;
}

function cachePath(cacheDir: string, pathname: string): string {
  const key = pathname === "/" ? "index" : pathname.replace(/^\//, "").replace(/\//g, "_");
  return join(cacheDir, `${key}.html.json`);
}

export async function getCachedHtml(
  cacheDir: string,
  pathname: string,
): Promise<CacheEntry | undefined> {
  const path = cachePath(cacheDir, pathname);
  try {
    const raw = await readFile(path, "utf8");
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.generatedAt < entry.revalidate * 1000) {
      return entry;
    }
  } catch {
    // cache miss or invalid
  }
  return undefined;
}

export async function setCachedHtml(
  cacheDir: string,
  pathname: string,
  html: string,
  revalidate: number,
): Promise<void> {
  const path = cachePath(cacheDir, pathname);
  await mkdir(dirname(path), { recursive: true });
  const entry: CacheEntry = { html, generatedAt: Date.now(), revalidate };
  await writeFile(path, JSON.stringify(entry), "utf8");
}

export async function isStale(cacheDir: string, pathname: string): Promise<boolean> {
  const path = cachePath(cacheDir, pathname);
  try {
    const raw = await readFile(path, "utf8");
    const entry = JSON.parse(raw) as CacheEntry;
    return Date.now() - entry.generatedAt >= entry.revalidate * 1000;
  } catch {
    return true;
  }
}

export async function clearCache(cacheDir: string): Promise<void> {
  try {
    const { rm } = await import("node:fs/promises");
    await rm(cacheDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
