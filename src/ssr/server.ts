import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { scanRoutes } from "../router/route-scanner";
import { matchRoute } from "./match";
import { renderPage } from "./render";

export interface SsrServerOptions {
  /** Absolute path to the app directory (e.g. /project/src/app). */
  appDir: string;
  /** Absolute path to the public directory for static files (optional). */
  publicDir?: string;
  /** Base path for the client entry module, e.g. "/_nix-js/entry-client.js". */
  clientEntry?: string;
  /** Default language for the HTML shell. */
  lang?: string;
  port?: number;
  host?: string;
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

  const server = createServer(async (req, res) => {
    let urlPath = req.url ?? "/";
    if (urlPath.includes("?")) urlPath = urlPath.split("?")[0];

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
    if (match) {
      try {
        const html = await renderPage({
          route: match.route,
          params: match.params,
          searchParams: match.searchParams,
          config: { lang: options.lang ?? "es", clientEntry: options.clientEntry },
        });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      } catch (err) {
        console.error("[ssr] error rendering", urlPath, err);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(String(err));
        return;
      }
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
