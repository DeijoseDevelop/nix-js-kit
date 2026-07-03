import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { Plugin, Connect, ViteDevServer } from "vite";
import { scanRoutes } from "../router/route-scanner";
import { scanActions } from "../action/scan";
import { handleActionRequest } from "../action/server";
import { scanIslands } from "../island/scan";
import { buildEntrySource } from "../island/generate-entry";
import { matchRoute } from "../ssr/match";
import { renderPage, renderErrorPage } from "../ssr/render";

export interface NixJsKitViteOptions {
  /** App directory relative to Vite root (default: src/app). */
  appDir?: string;
  /** Islands directory relative to Vite root (default: src/islands). */
  islandsDir?: string;
  /** Where to write the generated client entry (default: .nix-js/entry-client.ts). */
  generatedEntry?: string;
  /** Public path for the client entry module (default: /_nix-js/entry-client.js). */
  clientEntry?: string;
  /** HTML lang attribute (default: es). */
  lang?: string;
  /** Import specifier for hydrateIslands in the generated entry. */
  hydrateImport?: string;
}

/**
 * Official Vite plugin for nix-js-kit.
 *
 * In dev mode it generates the islands entry and renders every page via SSR.
 * In production builds it can be combined with `nix-js-kit build` to generate
 * static HTML files.
 */
export function nixJsKit(options: NixJsKitViteOptions = {}): Plugin {
  const appDir = options.appDir ?? "src/app";
  const islandsDir = options.islandsDir ?? "src/islands";
  const generatedEntry = options.generatedEntry ?? ".nix-js/entry-client.ts";
  const clientEntry = options.clientEntry ?? "/_nix-js/entry-client.js";
  const lang = options.lang ?? "es";
  const hydrateImport = options.hydrateImport ?? "@deijose/nix-js-kit/island";

  let routes: Awaited<ReturnType<typeof scanRoutes>> | null = null;
  let actions: Record<string, string> = {};
  let root: string = ".";

  return {
    name: "nix-js-kit",
    enforce: "pre",

    async configResolved(config) {
      root = config.root;
      const entryPath = resolve(root, generatedEntry);
      const islands = await scanIslands(resolve(root, islandsDir));
      const source = buildEntrySource(islands, entryPath, hydrateImport);
      await mkdir(dirname(entryPath), { recursive: true });
      await writeFile(entryPath, source, "utf8");

      const appDirPath = resolve(root, appDir);
      routes = await scanRoutes(appDirPath);
      actions = await scanActions(appDirPath);
    },

    configureServer(server) {
      const ssrLoad = createSsrLoader(server, root);
      const resolveAction = createActionResolver(actions);

      server.middlewares.use(async (req, res, next) => {
        const urlPath = req.url ?? "/";

        // Server actions endpoint.
        if (urlPath === "/__nix-js/actions" && req.method === "POST") {
          try {
            const body = await readRequestBody(req);
            const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            });
            const response = await handleActionRequest(request, resolveAction);
            res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
            res.end(await response.text());
          } catch (err) {
            console.error("[nix-js-kit] action error:", err);
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(String(err));
          }
          return;
        }

        if (urlPath.startsWith("/_nix-js/entry-client.js")) {
          const transformed = await server.transformRequest(
            "/.nix-js/entry-client.ts",
          );
          if (transformed) {
            res.writeHead(200, {
              "Content-Type": "application/javascript; charset=utf-8",
            });
            res.end(transformed.code);
            return;
          }
        }

        const handled = await handleSsrRequest(req, res, next, {
          routes,
          actions,
          clientEntry,
          lang,
          ssrLoad,
        });
        if (!handled) next();
      });
    },
  };
}

function createSsrLoader(server: ViteDevServer, root: string) {
  return (filePath: string) => {
    const rel = relative(root, filePath);
    const url = "/" + rel.split("\\").join("/");
    return server.ssrLoadModule(url);
  };
}

function createActionResolver(actions: Record<string, string>) {
  return async (name: string) => {
    const actionPath = actions[name];
    if (!actionPath) return undefined;
    const mod = (await import(actionPath)) as Record<string, unknown>;
    const action = mod[name];
    if (typeof action === "function") {
      return action as (...args: unknown[]) => unknown;
    }
    return undefined;
  };
}

function readRequestBody(req: Connect.IncomingMessage): Promise<string> {
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

interface SsrHandlerOptions {
  routes: Awaited<ReturnType<typeof scanRoutes>> | null;
  actions: Record<string, string>;
  clientEntry: string;
  lang: string;
  ssrLoad: (path: string) => Promise<unknown>;
}

async function handleSsrRequest(
  req: Connect.IncomingMessage,
  res: import("node:http").ServerResponse,
  _next: Connect.NextFunction,
  options: SsrHandlerOptions,
): Promise<boolean> {
  if (!options.routes) return false;

  let urlPath = req.url ?? "/";
  if (urlPath.includes("?")) urlPath = urlPath.split("?")[0];

  // Let Vite handle its own internals and assets.
  if (urlPath.startsWith("/@") || urlPath.startsWith("/node_modules/")) {
    return false;
  }

  // Skip explicit file requests.
  if (urlPath.includes(".")) return false;

  const config = { lang: options.lang, clientEntry: options.clientEntry };
  const match = matchRoute(urlPath, options.routes.pages);
  if (match) {
    try {
      const html = await renderPage({
        route: match.route,
        params: match.params,
        searchParams: match.searchParams,
        config,
        importer: options.ssrLoad,
        actions: options.actions,
      });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return true;
    } catch (err) {
      console.error("[nix-js-kit] SSR render error:", err);
      const errorResult = await renderErrorPage({
        routes: options.routes,
        status: 500,
        error: err,
        config,
        actions: options.actions,
        importer: options.ssrLoad,
      });
      if (errorResult) {
        res.writeHead(errorResult.status, { "Content-Type": "text/html; charset=utf-8" });
        res.end(errorResult.html);
      } else {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(String(err));
      }
      return true;
    }
  }

  const errorResult = await renderErrorPage({
    routes: options.routes,
    status: 404,
    config,
    actions: options.actions,
    importer: options.ssrLoad,
  });
  if (errorResult) {
    res.writeHead(errorResult.status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(errorResult.html);
    return true;
  }

  return false;
}
