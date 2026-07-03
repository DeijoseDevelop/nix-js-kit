import { readdir } from "node:fs/promises";
import { join } from "node:path";

// =============================================================================
// --- Route scanner ---
// =============================================================================
//
// Walks src/app/ and maps file conventions to URL paths.
//
// Supported in v0.1:
//   - page.ts          -> URL path
//   - page.data.ts     -> loader for that page
//   - layout.ts        -> layout wrapping pages in the same segment
//   - route.ts         -> API endpoint (collected separately)
//
// Dynamic segments:
//   - [slug]           -> :slug
//   - [...slug]        -> catch-all (rendered as :slug*)
// =============================================================================

/** A page route discovered by the scanner. */
export interface PageRoute {
  /** URL path, e.g. "/blog/:slug". */
  path: string;
  /** File system path to the page.ts module. */
  pagePath: string;
  /** File system path to the page.data.ts module, if any. */
  dataPath?: string;
  /** File system path to the page.action.ts module, if any. */
  actionPath?: string;
  /** Ordered list of layout.ts modules from root to leaf. */
  layouts: string[];
  /** Dynamic parameter names extracted from the path. */
  params: string[];
}

/** An API route discovered by the scanner. */
export interface ApiRoute {
  /** URL path, e.g. "/api/posts". */
  path: string;
  /** File system path to the route.ts module. */
  routePath: string;
  /** Dynamic parameter names extracted from the path. */
  params: string[];
}

/** Result of scanning the app directory. */
export interface ScannedRoutes {
  pages: PageRoute[];
  api: ApiRoute[];
}

function isRouteGroup(segment: string): boolean {
  return segment.startsWith("(") && segment.endsWith(")");
}

function segmentToUrl(segment: string): string {
  if (segment.startsWith("[...") && segment.endsWith("]")) {
    return `:${segment.slice(4, -1)}*`;
  }
  if (segment.startsWith("[") && segment.endsWith("]")) {
    return `:${segment.slice(1, -1)}`;
  }
  return segment;
}

function extractParams(segment: string): string[] {
  if (segment.startsWith("[...") && segment.endsWith("]")) {
    return [segment.slice(4, -1)];
  }
  if (segment.startsWith("[") && segment.endsWith("]")) {
    return [segment.slice(1, -1)];
  }
  return [];
}

async function collectFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

async function collectDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function scanRecursive(
  appDir: string,
  currentDir: string,
  urlSegments: string[],
  params: string[],
  layouts: string[],
  result: ScannedRoutes,
): Promise<void> {
  const files = await collectFiles(currentDir);
  const dirs = await collectDirs(currentDir);

  const pagePath = files.includes("page.ts")
    ? join(currentDir, "page.ts")
    : undefined;
  const dataPath = files.includes("page.data.ts")
    ? join(currentDir, "page.data.ts")
    : undefined;
  const actionPath = files.includes("page.action.ts")
    ? join(currentDir, "page.action.ts")
    : undefined;
  const layoutPath = files.includes("layout.ts")
    ? join(currentDir, "layout.ts")
    : undefined;
  const routePath = files.includes("route.ts")
    ? join(currentDir, "route.ts")
    : undefined;

  const currentLayouts = layoutPath
    ? [...layouts, layoutPath]
    : [...layouts];

  if (routePath) {
    result.api.push({
      path: urlSegments.length === 0 ? "/" : "/" + urlSegments.join("/"),
      routePath,
      params: [...params],
    });
  }

  if (pagePath) {
    result.pages.push({
      path: urlSegments.length === 0 ? "/" : "/" + urlSegments.join("/"),
      pagePath,
      dataPath,
      actionPath,
      layouts: currentLayouts,
      params: [...params],
    });
  }

  for (const dir of dirs) {
    if (isRouteGroup(dir)) {
      // Route groups do not add a URL segment, but they can add a layout.
      const groupDir = join(currentDir, dir);
      const groupFiles = await collectFiles(groupDir);
      const groupLayout = groupFiles.includes("layout.ts")
        ? join(groupDir, "layout.ts")
        : undefined;
      await scanRecursive(
        appDir,
        groupDir,
        urlSegments,
        params,
        groupLayout ? [...currentLayouts, groupLayout] : currentLayouts,
        result,
      );
      continue;
    }

    await scanRecursive(
      appDir,
      join(currentDir, dir),
      [...urlSegments, segmentToUrl(dir)],
      [...params, ...extractParams(dir)],
      currentLayouts,
      result,
    );
  }
}

/**
 * Scans an app directory for Nix Kit file-based routes.
 *
 * @param appDir Absolute path to the app directory (e.g. "src/app").
 * @returns Discovered page and API routes.
 */
export async function scanRoutes(appDir: string): Promise<ScannedRoutes> {
  const result: ScannedRoutes = { pages: [], api: [] };
  await scanRecursive(appDir, appDir, [], [], [], result);
  return result;
}
