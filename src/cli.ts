import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, resolve, relative } from "node:path";
import { watch } from "node:fs";
import { spawnSync } from "node:child_process";
import { build, type BuildConfig } from "./build/build";
import { transformProjectFiles } from "./build/transform-source";
import { createSsrServer } from "./ssr/server";
import { scanActions, actionNames } from "./action/scan";
import { scanRoutes } from "./router/route-scanner";
import { matchRoute, matchApiRoute } from "./ssr/match";
import { handleActionRequest } from "./action/server";

// =============================================================================
// --- CLI ---
// =============================================================================
//
// Minimal command-line interface for Nix Kit. Supports:
//   nix-js-kit build   — run a production static build
//   nix-js-kit dev     — run a dev server that rebuilds on file changes
//   nix-js-kit preview — serve the static build in production mode
//   nix-js-kit start   — run an SSR server that renders pages on demand
//
// This is intentionally small: no generators, no config file parsing, just
// convention-based defaults overridable via CLI flags.
// =============================================================================

export interface CliOptions {
  command: "build" | "dev" | "preview" | "start" | "adapter";
  adapterName?: "vercel" | "netlify" | "bun" | "node";
  root: string;
  appDir: string;
  islandsDir?: string;
  outDir: string;
  generatedEntry: string;
  clientEntry: string;
  port: number;
  host: string;
  lang: string;
  hydrateImport?: string;
  routerImport?: string;
  /**
   * Path to a Vite config used to build the client hydration bundle.
   * In dev mode it is rebuilt whenever source files change.
   */
  clientConfig?: string;
  /** Absolute path to the ISR cache directory. */
  cacheDir?: string;
  /** Default revalidate interval in seconds for ISR. */
  defaultRevalidate?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-?")) {
    printHelp();
    process.exit(0);
  }
  const command = args[0];
  if (command !== "build" && command !== "dev" && command !== "preview" && command !== "start" && command !== "adapter") {
    throw new Error(`Usage: nix-js-kit <build|dev|preview|start|adapter> [options]`);
  }
  const adapterName = command === "adapter" ? args[1] : undefined;
  if (
    command === "adapter" &&
    adapterName !== "vercel" &&
    adapterName !== "netlify" &&
    adapterName !== "bun" &&
    adapterName !== "node"
  ) {
    throw new Error(`Usage: nix-js-kit adapter <vercel|netlify|bun|node> [options]`);
  }
  const optionStart = command === "adapter" ? 2 : 1;

  let root = process.cwd();
  let appDir = "src/app";
  let islandsDir = "src/islands";
  let outDir = "dist";
  let generatedEntry = ".nix-js/entry-client.ts";
  let clientEntry = "/_nix-js/entry-client.js";
  let port = 3000;
  let host = "127.0.0.1";
  let lang = "es";
  let hydrateImport: string | undefined;
  let routerImport: string | undefined;
  let clientConfig: string | undefined;
  let cacheDir: string | undefined;
  let defaultRevalidate: number | undefined;

  for (let i = optionStart; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case "--root":
      case "-r":
        root = next;
        i++;
        break;
      case "--app":
      case "-a":
        appDir = next;
        i++;
        break;
      case "--islands":
      case "-i":
        islandsDir = next;
        i++;
        break;
      case "--out":
      case "-o":
        outDir = next;
        i++;
        break;
      case "--port":
      case "-p":
        port = Number(next);
        i++;
        break;
      case "--host":
      case "-h":
        host = next;
        i++;
        break;
      case "--lang":
      case "-l":
        lang = next;
        i++;
        break;
      case "--hydrate-import":
        hydrateImport = next;
        i++;
        break;
      case "--router-import":
        routerImport = next;
        i++;
        break;
      case "--client-config":
        clientConfig = next;
        i++;
        break;
      case "--cache-dir":
        cacheDir = next;
        i++;
        break;
      case "--default-revalidate":
        defaultRevalidate = Number(next);
        i++;
        break;
      case "--help":
      case "-?":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    command,
    adapterName: adapterName as CliOptions["adapterName"],
    root: resolve(root),
    appDir: resolve(root, appDir),
    islandsDir: resolve(root, islandsDir),
    outDir: resolve(root, outDir),
    generatedEntry: resolve(root, generatedEntry),
    clientEntry,
    port,
    host,
    lang,
    hydrateImport,
    routerImport,
    clientConfig: clientConfig ? resolve(root, clientConfig) : undefined,
    cacheDir: cacheDir ? resolve(root, cacheDir) : undefined,
    defaultRevalidate,
  };
}

function printHelp(): void {
  console.log(`
nix-js-kit <command> [options]

Commands:
  build            Run a static site build
  dev              Run a development server with rebuild-on-change
  preview          Serve the static build in production mode
  start            Run an SSR server that renders pages on demand
  adapter <name>   Generate deployment output for a platform (vercel|netlify|bun|node)

Options:
  -r, --root <dir>          Project root (default: cwd)
  -a, --app <dir>           App directory relative to root (default: src/app)
  -i, --islands <dir>       Islands directory relative to root (default: src/islands)
  -o, --out <dir>           Output directory relative to root (default: dist)
  -p, --port <number>       Server port (default: 3000)
  -h, --host <address>      Server host (default: 127.0.0.1)
  -l, --lang <lang>         HTML lang attribute (default: es)
  --hydrate-import <spec>   Import specifier for hydrateIslands in generated entry
  --router-import <spec>    Import specifier for startClientRouter in generated entry
  --client-config <path>    Vite config used to build the client hydration bundle
  --cache-dir <dir>         Directory for ISR cache (only used by start)
  --default-revalidate <s>  Default ISR revalidate interval in seconds
`);
}

function toBuildConfig(options: CliOptions): BuildConfig {
  return {
    root: options.root,
    appDir: options.appDir,
    outDir: options.outDir,
    clientEntry: options.clientEntry,
    lang: options.lang,
    islandsDir: options.islandsDir,
    generatedEntry: options.generatedEntry,
    hydrateImport: options.hydrateImport,
    routerImport: options.routerImport,
  };
}

async function doBuild(options: CliOptions): Promise<void> {
  const transformedDir = join(options.root, ".nix-js", "transformed", "src", "app");
  await transformProjectFiles({
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir,
    outDir: transformedDir,
  });
  const buildConfig = toBuildConfig(options);
  buildConfig.appDir = transformedDir;
  const result = await build(buildConfig);

  if (options.islandsDir && !options.clientConfig) {
    const autoConfig = await findClientConfig(options.root);
    if (autoConfig) {
      options.clientConfig = autoConfig;
    }
  }
  if (options.clientConfig) {
    buildClient(options);
  }

  console.log(`✓ Build completo: ${result.pages} páginas generadas`);
  for (const file of result.files) {
    console.log("  -", relative(options.root, file));
  }
  if (result.islands.length > 0) {
    console.log(`\n✓ ${result.islands.length} island(s) detectada(s):`);
    for (const island of result.islands) {
      console.log("  -", island.name);
    }
    if (result.generatedEntry) {
      console.log("  entry:", relative(options.root, result.generatedEntry));
    }
  }
  if (result.skipped.length > 0) {
    console.log("\nRutas dinámicas omitidas (necesitan generateStaticParams):");
    for (const path of result.skipped) {
      console.log("  -", path);
    }
  }
}

async function doDev(options: CliOptions): Promise<void> {
  await doBuild(options);
  if (options.clientConfig) {
    buildClient(options);
  }

  const transformedDir = join(options.root, ".nix-js", "transformed", "src", "app");
  await transformProjectFiles({
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir,
    outDir: transformedDir,
  });

  const actions = await scanActions(transformedDir);
  const routes = await scanRoutes(transformedDir);
  const server = createServer((req, res) => handleRequest(req, res, options, actions, routes, true));
  server.listen(options.port, options.host, () => {
    console.log(`\n  → Dev server http://${options.host}:${options.port}`);
  });

  watchFiles(options, server);
}

export async function doPreview(options: CliOptions): Promise<import("node:http").Server> {
  try {
    const s = await stat(options.outDir);
    if (!s.isDirectory()) {
      throw new Error(`Output path is not a directory: ${options.outDir}`);
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `No build output found at ${options.outDir}. Run \`nix-js-kit build\` first.`,
      );
    }
    throw err;
  }

  const transformedDir = join(options.outDir, ".nix-js-transformed", "src", "app");
  await transformProjectFiles({
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir,
    outDir: transformedDir,
  });

  const actions = await scanActions(transformedDir);
  const routes = await scanRoutes(transformedDir);
  const server = createServer((req, res) => handleRequest(req, res, options, actions, routes));
  server.listen(options.port, options.host, () => {
    console.log(`\n  → Preview server http://${options.host}:${options.port}`);
  });
  return server;
}

async function doStart(options: CliOptions): Promise<void> {
  const transformedDir = join(options.root, ".nix-js", "transformed", "src", "app");
  await transformProjectFiles({
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir,
    outDir: transformedDir,
  });

  const ssr = await createSsrServer({
    root: options.root,
    appDir: transformedDir,
    publicDir: options.outDir,
    clientEntry: options.clientEntry,
    lang: options.lang,
    port: options.port,
    host: options.host,
    cacheDir: options.cacheDir,
    defaultRevalidate: options.defaultRevalidate,
  });
  await ssr.listen();
}

async function findClientConfig(root: string): Promise<string | undefined> {
  const candidates = ["vite.client.config.ts", "vite.client.config.js", "vite.client.config.mjs"];
  for (const name of candidates) {
    const path = resolve(root, name);
    try {
      if ((await stat(path)).isFile()) return path;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function buildClient(options: CliOptions): void {
  if (!options.clientConfig) return;
  console.log("[client] Building hydration bundle...");
  const result = spawnSync("npx", ["vite", "build", "--config", options.clientConfig], {
    stdio: "inherit",
    cwd: options.root,
  });
  if (result.status !== 0) {
    console.error("[client] Hydration bundle build failed");
  }
}

async function handleRequest(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  options: CliOptions,
  actions: import("./action/scan").ActionRegistry,
  routes: import("./router/route-scanner").ScannedRoutes,
  noCache = false,
): Promise<void> {
  const publicActions = actionNames(actions);

  const cacheHeaders = (base: Record<string, string>): Record<string, string> =>
    noCache ? { ...base, "Cache-Control": "no-store, must-revalidate" } : base;
  let urlPath = req.url ?? "/";
  if (urlPath.includes("?")) urlPath = urlPath.split("?")[0];

  // Server actions endpoint.
  if (urlPath === "/__nix-js/actions" && req.method === "POST") {
    try {
      const body = await readRequestBody(req);
      const headers = new Headers();
      const contentType = req.headers["content-type"];
      const accept = req.headers["accept"];
      if (contentType) headers.set("Content-Type", contentType);
      if (accept) headers.set("Accept", accept);
      const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
        method: "POST",
        headers,
        body,
      });
      const response = await handleActionRequest(request, createActionResolver(actions));
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(await response.text());
    } catch (err) {
      console.error("[nix-js-kit] action error:", err);
      res.writeHead(500, cacheHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      res.end(String(err));
    }
    return;
  }

  // Render endpoint used by the client-side router for SPA navigation.
  if (urlPath === "/__nix-js/render") {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const page = url.searchParams.get("page") ?? "/";
      const search = url.searchParams.get("search") ?? "";
      const { renderPageBody } = await import("./ssr/stream");
      const html = await renderPageBody({
        routes,
        pathname: page,
        searchParams: new URLSearchParams(search),
        config: { lang: options.lang, clientEntry: options.clientEntry },
        actions: publicActions,
      });
      res.writeHead(200, cacheHeaders({ "Content-Type": "text/html; charset=utf-8" }));
      res.end(html);
    } catch (err) {
      console.error("[nix-js-kit] render endpoint error:", err);
      res.writeHead(500, cacheHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      res.end(String(err));
    }
    return;
  }

  // API routes.
  const apiMatch = matchApiRoute(urlPath, routes.api);
  if (apiMatch) {
    try {
      const mod = (await import(apiMatch.route.routePath)) as Record<
        string,
        (request: Request, context?: { params: Record<string, string | string[]> }) => unknown
      >;
      const handler = mod[req.method ?? "GET"];
      if (typeof handler !== "function") {
        res.writeHead(405, cacheHeaders({ "Content-Type": "text/plain" }));
        res.end(`Method not allowed: ${req.method}`);
        return;
      }
      const body = req.method && req.method !== "GET" && req.method !== "HEAD" ? await readRequestBody(req) : undefined;
      const headers = new Headers();
      const contentType = req.headers["content-type"];
      const accept = req.headers["accept"];
      if (contentType) headers.set("Content-Type", contentType);
      if (accept) headers.set("Accept", accept);
      const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
        method: req.method,
        headers,
        body,
      });
      const response = (await handler(request, { params: apiMatch.params })) as Response;
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error("[nix-js-kit] API route error:", err);
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(String(err));
    }
    return;
  }

  const originalPath = urlPath;
  if (urlPath.endsWith("/")) urlPath += "index.html";
  if (extname(urlPath) === "") urlPath += "/index.html";
  if (urlPath.startsWith("/")) urlPath = urlPath.slice(1);

  const filePath = join(options.outDir, urlPath);

  try {
    const data = await readFile(filePath);
    const contentType = guessContentType(filePath);
    res.writeHead(200, cacheHeaders({ "Content-Type": contentType }));
    res.end(data);
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "EISDIR") {
      res.writeHead(500, cacheHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      res.end(String(err));
      return;
    }
  }

  // Fallback: try to render the route dynamically (e.g. for slugs not generated as static files).
  try {
    const { renderPage } = await import("./ssr/render");
    const match = matchRoute(originalPath, routes.pages);
    if (!match) {
      res.writeHead(404, cacheHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      res.end(`Not found: ${req.url}`);
      return;
    }
    const result = await renderPage({
      route: match.route,
      params: match.params,
      searchParams: new URLSearchParams(req.url?.split("?")[1] ?? ""),
      config: { lang: options.lang, clientEntry: options.clientEntry },
      actions: publicActions,
    });
    res.writeHead(200, cacheHeaders({ "Content-Type": "text/html; charset=utf-8" }));
    res.end(result.html);
  } catch (err) {
    console.error("[nix-js-kit] preview fallback render error:", err);
    res.writeHead(500, cacheHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    res.end(String(err));
  }
}

function createActionResolver(actions: import("./action/scan").ActionRegistry) {
  return async (name: string, page?: string) => {
    const pageActions = page ? actions[page] : Object.values(actions).find((p) => p[name]) ?? undefined;
    const actionPath = pageActions ? pageActions[name] : undefined;
    if (!actionPath) return undefined;
    const mod = (await import(actionPath)) as Record<string, unknown>;
    const action = mod[name];
    if (typeof action === "function") {
      return action as (...args: unknown[]) => unknown;
    }
    return undefined;
  };
}

function readRequestBody(req: import("node:http").IncomingMessage): Promise<string> {
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

function watchFiles(options: CliOptions, server: Server): void {
  const watchedDirs = [options.appDir, options.islandsDir].filter(Boolean) as string[];
  if (watchedDirs.length === 0) return;

  let rebuilding = false;
  let pendingRebuild = false;

  const scheduleRebuild = () => {
    if (rebuilding) {
      pendingRebuild = true;
      return;
    }
    rebuilding = true;

    console.log("\n[change] Rebuilding...");
    build(toBuildConfig(options))
      .then(() => {
        if (options.clientConfig) {
          buildClient(options);
        }
        console.log("[done] Reload the page to see changes.");
      })
      .catch((err) => {
        console.error("[error] Build failed:", err);
      })
      .finally(() => {
        rebuilding = false;
        if (pendingRebuild) {
          pendingRebuild = false;
          scheduleRebuild();
        }
      });
  };

  const watchers = watchedDirs.map((dir) =>
    watch(dir, { recursive: true }, (_event, filename) => {
      if (filename && filename.endsWith(".ts")) {
        scheduleRebuild();
      }
    }),
  );

  const cleanup = () => {
    for (const w of watchers) w.close();
    server.close();
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

async function doAdapter(options: CliOptions): Promise<void> {
  const adapterOptions = {
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir ?? resolve(options.root, "src/islands"),
    outDir: options.outDir,
    clientEntry: options.clientEntry,
    lang: options.lang,
    hydrateImport: options.hydrateImport,
  };
  if (options.adapterName === "vercel") {
    const { vercelAdapter } = await import("./adapters/vercel");
    await vercelAdapter.build(adapterOptions);
    console.log("\n  → Vercel output generated at .vercel/output");
  } else if (options.adapterName === "netlify") {
    const { netlifyAdapter } = await import("./adapters/netlify");
    await netlifyAdapter.build(adapterOptions);
    console.log("\n  → Netlify output generated at netlify/functions/__nix-js-kit.mjs");
  } else if (options.adapterName === "bun") {
    const { bunAdapter } = await import("./adapters/bun");
    await bunAdapter.build(adapterOptions);
    console.log("\n  → Bun server generated at .nix-js/bun-server.ts");
  } else if (options.adapterName === "node") {
    const { nodeAdapter } = await import("./adapters/node");
    await nodeAdapter.build(adapterOptions);
    console.log("\n  → Node server generated at .nix-js/node-server.mjs");
  }
}

export async function run(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  if (options.command === "build") {
    await doBuild(options);
  } else if (options.command === "preview") {
    await doPreview(options);
  } else if (options.command === "start") {
    await doStart(options);
  } else if (options.command === "adapter") {
    await doAdapter(options);
  } else {
    await doDev(options);
  }
}

// Only run when invoked directly (not when imported for testing).
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
