import { createServer, type IncomingMessage, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { scanRoutes } from "../router/route-scanner.js";
import { scanActions, actionNames } from "../action/scan.js";
import { handleActionRequest } from "../action/server.js";
import { getCachedHtml, setCachedHtml } from "../cache.js";
import { matchApiRoute, matchRoute } from "./match.js";
import { renderPage, renderErrorPage } from "./render.js";
import { renderPageBody, renderStreamingPage, RouteNotFoundError } from "./stream.js";

export interface SsrServerOptions {
  /** Absolute path to the app directory (e.g. /project/src/app). */
  appDir: string;
  /** Absolute path to the project root. When provided, action paths in the
   * serialized HTML shell are made relative to this root. */
  root?: string;
  /** Absolute path to the public directory for static files (optional). */
  publicDir?: string;
  /** Base path for the client entry module, e.g. "/_nix-js/entry-client.js". */
  clientEntry?: string;
  /** Default language for the HTML shell. */
  lang?: string;
  port?: number;
  host?: string;
  /** Absolute path to the ISR cache directory (optional). */
  cacheDir?: string;
  /** Default revalidate interval in seconds when a page does not export one. */
  defaultRevalidate?: number;
  /** If true, render pages with loading.ts boundaries using streaming. */
  streaming?: boolean;
}

export interface SsrServer {
  server: Server;
  listen(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Create an SSR server that renders pages on demand and serves static files.
 */
export async function createSsrServer(options: SsrServerOptions): Promise<SsrServer> {
  const routes = await scanRoutes(options.appDir);
  const actions = await scanActions(options.appDir);
  const publicActions = actionNames(actions);

  const resolveAction = async (name: string, page?: string) => {
    const pageKey = resolveActionPageKey(page, routes);
    const pageActions = pageKey ? actions[pageKey] : Object.values(actions).find((p) => p[name]) ?? undefined;
    const actionPath = pageActions ? pageActions[name] : undefined;
    if (!actionPath) return undefined;
    const mod = (await import(actionPath)) as Record<string, unknown>;
    const action = mod[name];
    if (typeof action === "function") {
      return action as (...args: unknown[]) => unknown;
    }
    return undefined;
  };

  const server = createServer(async (req, res) => {
    let urlPath = req.url ?? "/";
    if (urlPath.includes("?")) urlPath = urlPath.split("?")[0];

    // Server actions endpoint.
    if (urlPath === "/__nix-js/actions" && req.method === "POST") {
      try {
        const body = await readRequestBody(req);
        const headers = new Headers();
        const contentType = req.headers["content-type"];
        const accept = req.headers["accept"];
        const referer = req.headers["referer"];
        if (contentType) headers.set("Content-Type", contentType);
        if (accept) headers.set("Accept", accept);
        if (referer) headers.set("Referer", referer);
        const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
          method: "POST",
          headers,
          body,
        });
        const response = await handleActionRequest(request, resolveAction);
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        res.end(await response.text());
      } catch (err) {
        console.error("[action] error handling", err);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(String(err));
      }
      return;
    }

    if (urlPath === "/__nix-js/render") {
      const renderUrl = new URL(req.url ?? "/", "http://localhost");
      const page = renderUrl.searchParams.get("page") ?? "/";
      const search = renderUrl.searchParams.get("search") ?? "";
      const wantsJson = (req.headers["accept"] ?? "").includes("application/json");
      try {
        const headers = new Headers();
        const contentType = req.headers["content-type"];
        const accept = req.headers["accept"];
        const cookie = req.headers["cookie"];
        if (contentType) headers.set("Content-Type", contentType);
        if (accept) headers.set("Accept", accept);
        if (cookie) headers.set("Cookie", cookie);
        const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
          method: req.method,
          headers,
        });

        // ISR: cache the real content served by this endpoint when a cache
        // directory is configured, so streamed pages regenerate on a TTL.
        let body: string;
        let title: string;
        const ttl = await resolveTtl(options, page, routes);
        const cacheKey = `/__nix-js/render${page}?${search}`;
        if (options.cacheDir && typeof ttl === "number") {
          const cached = await getCachedHtml(options.cacheDir, cacheKey);
          if (cached) {
            body = extractBody(cached.html);
            title = extractTitle(cached.html);
          } else {
            const rendered = await renderPageBody({
              routes,
              pathname: page,
              searchParams: new URLSearchParams(search),
              config: { lang: options.lang ?? "es", clientEntry: options.clientEntry },
              actions: publicActions,
              request,
            });
            body = rendered.body;
            title = rendered.title;
            await setCachedHtml(options.cacheDir, cacheKey, rendered.fullHtml ?? "", ttl);
          }
        } else {
          const rendered = await renderPageBody({
            routes,
            pathname: page,
            searchParams: new URLSearchParams(search),
            config: { lang: options.lang ?? "es", clientEntry: options.clientEntry },
            actions: publicActions,
            request,
          });
          body = rendered.body;
          title = rendered.title;
        }

        if (wantsJson) {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ title, body }));
        } else {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(body);
        }
      } catch (err) {
        if (err instanceof RouteNotFoundError) {
          console.log(`[ssr] render endpoint: no route for ${page}`);
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
          return;
        }
        console.error("[ssr] streaming render error", err);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
      return;
    }

    // Try API routes first.
    const apiMatch = matchApiRoute(urlPath, routes.api);
    if (apiMatch) {
      try {
        const mod = (await import(apiMatch.route.routePath)) as Record<
          string,
          (request: Request, context?: { params: Record<string, string | string[]> }) => unknown
        >;
        const handler = mod[req.method ?? "GET"];
        if (typeof handler !== "function") {
          res.writeHead(405, { "Content-Type": "text/plain" });
          res.end(`Method not allowed: ${req.method}`);
          return;
        }
        const body = req.method && req.method !== "GET" && req.method !== "HEAD" ? await readRequestBody(req) : undefined;
        const headers = new Headers();
        const contentType = req.headers["content-type"];
        const accept = req.headers["accept"];
        const cookie = req.headers["cookie"];
        if (contentType) headers.set("Content-Type", contentType);
        if (accept) headers.set("Accept", accept);
        if (cookie) headers.set("Cookie", cookie);
        const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
          method: req.method,
          headers,
          body,
        });
        const response = (await handler(request, { params: apiMatch.params })) as Response;
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (err) {
        console.error("[api] error handling", urlPath, err);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(String(err));
      }
      return;
    }

    // Try static files first.
    if (options.publicDir) {
      try {
        const served = await tryServeStatic(res, options.publicDir, urlPath);
        if (served) return;
      } catch (err) {
        console.error("[static] error serving", urlPath, err);
      }
    }

    // Try SSR page rendering.
    const match = matchRoute(urlPath, routes.pages);
    const config = { lang: options.lang ?? "es", clientEntry: options.clientEntry };
    if (match) {
      try {
        const headers = new Headers();
        const contentType = req.headers["content-type"];
        const accept = req.headers["accept"];
        const cookie = req.headers["cookie"];
        if (contentType) headers.set("Content-Type", contentType);
        if (accept) headers.set("Accept", accept);
        if (cookie) headers.set("Cookie", cookie);
        const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
          method: req.method,
          headers,
        });

        let html: string;
        const revalidate = match.route.dataPath
          ? ((await import(match.route.dataPath)) as { revalidate?: number }).revalidate
          : undefined;
        const ttl = revalidate ?? options.defaultRevalidate;
        const useStreaming = options.streaming !== false && match.route.loadingPath;
        if (useStreaming) {
          html = await renderStreamingPage({
            route: match.route,
            params: match.params,
            searchParams: new URLSearchParams(req.url?.split("?")[1] ?? ""),
            config,
            actions: publicActions,
            request,
          });
        } else if (options.cacheDir && typeof ttl === "number") {
          const cached = await getCachedHtml(options.cacheDir, urlPath);
          if (cached) {
            html = cached.html;
          } else {
            const result = await renderPage({
              route: match.route,
              params: match.params,
              searchParams: new URLSearchParams(req.url?.split("?")[1] ?? ""),
              config,
              actions: publicActions,
              request,
            });
            html = result.html;
            await setCachedHtml(options.cacheDir, urlPath, html, ttl);
          }
        } else {
          html = (await renderPage({
            route: match.route,
            params: match.params,
            searchParams: new URLSearchParams(req.url?.split("?")[1] ?? ""),
            config,
            actions: publicActions,
            request,
          })).html;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      } catch (err) {
        console.error("[ssr] error rendering", urlPath, err);
        const errorResult = await renderErrorPage({
          routes,
          status: 500,
          error: err,
          config,
          actions: publicActions,
        });
        if (errorResult) {
          res.writeHead(errorResult.status, { "Content-Type": "text/html; charset=utf-8" });
          res.end(errorResult.html);
        } else {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(String(err));
        }
        return;
      }
    }

    const errorResult = await renderErrorPage({
      routes,
      status: 404,
      config,
      actions: publicActions,
    });
    if (errorResult) {
      res.writeHead(errorResult.status, { "Content-Type": "text/html; charset=utf-8" });
      res.end(errorResult.html);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Not found: ${req.url}`);
  });

  return {
    server,
    listen() {
      return new Promise((resolve) => {
        server.listen(options.port ?? 3000, options.host ?? "127.0.0.1", () => {
          console.log(
            `\n  → SSR server http://${options.host ?? "127.0.0.1"}:${options.port ?? 3000}`,
          );
          resolve();
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function tryServeStatic(
  res: import("node:http").ServerResponse,
  publicDir: string,
  urlPath: string,
): Promise<boolean> {
  let filePath = join(publicDir, urlPath);
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Try clean URL fallback (e.g. /about -> /about/index.html)
      try {
        const indexPath = join(filePath, "index.html");
        await stat(indexPath);
        filePath = indexPath;
      } catch {
        return false;
      }
    } else {
      throw err;
    }
  }

  const data = await readFile(filePath);
  res.writeHead(200, { "Content-Type": guessContentType(filePath) });
  res.end(data);
  return true;
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function guessContentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

/**
 * Maps a concrete page path (e.g. `/movies/inception`) to the route pattern
 * key used by the action registry (e.g. `/movies/:slug`). Falls back to the
 * path itself when it matches an exact registry key.
 */
export function resolveActionPageKey(
  page: string | undefined,
  routes: Awaited<ReturnType<typeof scanRoutes>>,
): string | undefined {
  if (!page) return undefined;
  if (routes.pages.some((route) => route.path === page)) return page;
  const match = matchRoute(page, routes.pages);
  return match ? match.route.path : page;
}

/** Resolves the ISR TTL for a page: route `revalidate` or the default. */
async function resolveTtl(
  options: SsrServerOptions,
  pathname: string,
  routes: Awaited<ReturnType<typeof scanRoutes>>,
): Promise<number | undefined> {
  const match = matchRoute(pathname, routes.pages);
  if (!match) return undefined;
  const revalidate = match.route.dataPath
    ? ((await import(match.route.dataPath)) as { revalidate?: number }).revalidate
    : undefined;
  return revalidate ?? options.defaultRevalidate;
}

function extractBody(fullHtml: string): string {
  const match = fullHtml.match(/<div id="app">([\s\S]*)<\/div>\s*(<script|$)/);
  return match ? match[1].trim() : fullHtml;
}

function extractTitle(fullHtml: string): string {
  const match = fullHtml.match(/<title>([^<]*)<\/title>/);
  return match ? match[1] : "";
}
