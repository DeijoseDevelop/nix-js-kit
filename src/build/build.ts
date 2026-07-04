import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { scanRoutes, type PageRoute, type ScannedRoutes } from "../router/route-scanner";
import { scanIslands, type IslandModule } from "../island/scan";
import { generateClientEntry } from "../island/generate-entry";
import { renderPage, renderErrorPage } from "../ssr/render";
import { scanActions, relativeActions, type ActionRegistry } from "../action/scan";
import type { RouteParams, GenerateStaticParams } from "../types";

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
  /** Absolute path to the project root (e.g. /project). When provided, action
   * paths in the serialized HTML shell are made relative to this root. */
  root?: string;
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

  const segments = urlPath.slice(1).split("/");
  return join(outDir, ...segments, "index.html");
}

function isDynamic(path: string): boolean {
  return path.includes(":");
}

function buildConcreteUrl(path: string, params: RouteParams): string {
  return path.replace(/:([a-zA-Z0-9_]+)(\*)?/g, (_, name, catchAll) => {
    const value = params[name];
    if (value === undefined || value === null) {
      throw new Error(
        `Missing value for dynamic segment "${name}" in path "${path}"`,
      );
    }
    if (catchAll) {
      return Array.isArray(value) ? value.join("/") : String(value);
    }
    return String(value);
  });
}

/**
 * Builds a static site from a scanned route tree.
 *
 * @param config Build configuration.
 * @returns Summary of generated files.
 */
export async function build(config: BuildConfig): Promise<BuildResult> {
  const routes = await scanRoutes(config.appDir);
  const actions = await scanActions(config.appDir);
  // Avoid exposing absolute server paths in the serialized HTML shell.
  const publicActions = config.root ? relativeActions(actions, config.root) : actions;
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
    if (!isDynamic(route.path)) {
      const filePath = await buildPage(config, route, publicActions);
      result.pages++;
      result.files.push(filePath);
      continue;
    }

    const dynamicFiles = await buildDynamicPages(config, route, publicActions);
    if (dynamicFiles.length === 0) {
      result.skipped.push(route.path);
    } else {
      result.pages += dynamicFiles.length;
      result.files.push(...dynamicFiles);
    }
  }

  // Generate static 404 and 500 error pages when they exist.
  const errorConfig = { lang: config.lang, clientEntry: config.clientEntry };
  if (routes.error404) {
    const result404 = await renderErrorPage({
      routes,
      status: 404,
      config: errorConfig,
      actions: publicActions,
    });
    if (result404) {
      const filePath = join(config.outDir, "404.html");
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, result404.html, "utf8");
      result.files.push(filePath);
    }
  }

  if (routes.error500) {
    const result500 = await renderErrorPage({
      routes,
      status: 500,
      config: errorConfig,
      actions: publicActions,
    });
    if (result500) {
      const filePath = join(config.outDir, "500.html");
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, result500.html, "utf8");
      result.files.push(filePath);
    }
  }

  return result;
}

async function buildPage(
  config: BuildConfig,
  route: PageRoute,
  actions: ActionRegistry,
): Promise<string> {
  return buildConcretePage(config, route, {}, actions);
}

async function buildDynamicPages(
  config: BuildConfig,
  route: PageRoute,
  actions: ActionRegistry,
): Promise<string[]> {
  const { generateStaticParams } = (await import(
    route.pagePath
  )) as { generateStaticParams?: GenerateStaticParams };

  if (!generateStaticParams) {
    return [];
  }

  const paramList = await generateStaticParams();
  if (!Array.isArray(paramList) || paramList.length === 0) {
    return [];
  }

  const files: string[] = [];
  for (const params of paramList) {
    files.push(await buildConcretePage(config, route, params, actions));
  }
  return files;
}

async function buildConcretePage(
  config: BuildConfig,
  route: PageRoute,
  params: RouteParams,
  actions: ActionRegistry,
): Promise<string> {
  const { html: htmlOut } = await renderPage({
    route,
    params,
    searchParams: new URLSearchParams(),
    config: { lang: config.lang, clientEntry: config.clientEntry },
    actions,
  });

  const urlPath = isDynamic(route.path) ? buildConcreteUrl(route.path, params) : route.path;
  const filePath = urlToFilePath(config.outDir, urlPath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, htmlOut, "utf8");

  return filePath;
}

export { scanRoutes, type PageRoute, type ScannedRoutes };
