import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { renderToString } from "../render/render-to-string";
import { documentShell } from "./document-shell";
import { scanRoutes, type PageRoute, type ScannedRoutes } from "../router/route-scanner";
import { scanIslands, type IslandModule } from "../island/scan";
import { generateClientEntry } from "../island/generate-entry";
import type { PageProps, PageDataLoad } from "../types";

// =============================================================================
// --- SSG build orchestrator ---
// =============================================================================
//
// Takes a scanned route tree and writes static HTML files for every page.
//
// Layout support is detected but not yet rendered in v0.1; the page component
// is rendered directly. The shell carries the serialized loader data so the
// future client entry can hydrate islands.
// =============================================================================

export interface BuildConfig {
  /** Absolute path to the app directory (e.g. /project/src/app). */
  appDir: string;
  /** Absolute path to the output directory (e.g. /project/dist). */
  outDir: string;
  /** Base path for the client entry module, e.g. "/_nix-js/entry-client.js". */
  clientEntry?: string;
  /** Default language for the HTML shell. */
  lang?: string;
  /**
   * Absolute path to the islands directory (e.g. /project/src/islands).
   * When set, `build` scans it and generates a client entry module listing
   * every island so you don't have to maintain `entry-client.ts` by hand.
   */
  islandsDir?: string;
  /**
   * Absolute path where the generated client entry module is written
   * (e.g. /project/.nix-js/entry-client.ts). Required when `islandsDir` is set.
   */
  generatedEntry?: string;
  /**
   * Import specifier the generated entry uses for `hydrateIslands`.
   * Defaults to the published subpath `@deijose/nix-js-kit/island`.
   */
  hydrateImport?: string;
}

export interface BuildResult {
  /** Number of static HTML pages generated. */
  pages: number;
  /** Paths that were skipped because they are dynamic without a static param list. */
  skipped: string[];
  /** Absolute paths to the generated HTML files. */
  files: string[];
  /** Islands discovered when `islandsDir` is set. */
  islands: IslandModule[];
  /** Absolute path to the generated client entry, if one was written. */
  generatedEntry?: string;
}

function urlToFilePath(outDir: string, urlPath: string): string {
  if (urlPath === "/") {
    return join(outDir, "index.html");
  }

  // Replace dynamic segments with their literal placeholder for SSG templates.
  // E.g. /blog/:slug -> /blog/[slug]/index.html
  const segments = urlPath
    .slice(1)
    .split("/")
    .map((seg) => seg.replace(/:([^/]+)/g, "[$1]"));

  return join(outDir, ...segments, "index.html");
}

function isDynamic(path: string): boolean {
  return path.includes(":");
}

/**
 * Builds a static site from a scanned route tree.
 *
 * @param config Build configuration.
 * @returns Summary of generated files.
 */
export async function build(config: BuildConfig): Promise<BuildResult> {
  const routes = await scanRoutes(config.appDir);
  const result: BuildResult = { pages: 0, skipped: [], files: [], islands: [] };

  // Scan islands and generate the client entry before rendering pages, so the
  // hydration bundle stays in sync with what the app actually uses.
  if (config.islandsDir) {
    result.islands = await scanIslands(config.islandsDir);

    if (config.generatedEntry) {
      result.generatedEntry = await generateClientEntry({
        islands: result.islands,
        outFile: config.generatedEntry,
        hydrateImport: config.hydrateImport,
      });
    }
  }

  for (const route of routes.pages) {
    if (isDynamic(route.path)) {
      result.skipped.push(route.path);
      continue;
    }

    const filePath = await buildPage(config, route);
    result.pages++;
    result.files.push(filePath);
  }

  return result;
}

async function buildPage(config: BuildConfig, route: PageRoute): Promise<string> {
  const { default: PageComponent } = await import(route.pagePath);

  let data: unknown;
  if (route.dataPath) {
    const { load } = await import(route.dataPath) as { load?: PageDataLoad };
    if (load) {
      data = await load({
        params: {},
        searchParams: new URLSearchParams(),
      });
    }
  }

  const props: PageProps<unknown> = {
    data: data ?? {},
    params: {},
    searchParams: new URLSearchParams(),
  };

  // Import layouts eagerly; composition itself must happen inside
  // renderToString so html`` is evaluated while the DOM globals are installed.
  const layoutModules = await Promise.all(
    route.layouts.map(async (layoutPath) => import(layoutPath)),
  );

  const body = await renderToString(() => {
    let template = PageComponent(props);
    for (let i = layoutModules.length - 1; i >= 0; i--) {
      const { default: Layout } = layoutModules[i];
      template = Layout({ children: template });
    }
    return template;
  });
  const title = typeof data === "object" && data && "title" in data
    ? String((data as { title?: unknown }).title ?? "Nix Kit")
    : "Nix Kit";

  const htmlOut = documentShell({
    title,
    lang: config.lang,
    body,
    data,
    clientEntry: config.clientEntry,
  });

  const filePath = urlToFilePath(config.outDir, route.path);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, htmlOut, "utf8");

  return filePath;
}

export { scanRoutes, type PageRoute, type ScannedRoutes };
