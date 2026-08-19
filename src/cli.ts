import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, relative } from "node:path";
import { existsSync, watch } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, type BuildConfig } from "./build/build.js";
import { transformProjectFiles, transformedAppDir as transformedAppDirOf } from "./build/transform-source.js";
import { createSsrServer } from "./ssr/server.js";
import { scanActions, actionNames } from "./action/scan.js";
import { scanRoutes } from "./router/route-scanner.js";
import { matchRoute, matchApiRoute } from "./ssr/match.js";
import { handleActionRequest } from "./action/server.js";
import { incomingMessageToRequest } from "./runtime/node-http.js";
import { resolveStaticFile } from "./runtime/static.js";
import { loadNixConfig, type ResolvedNixConfig } from "./config/index.js";
import { createAppManifest, writeAppManifest, writeRouteTypes } from "./manifest/index.js";

// =============================================================================
// --- CLI ---
// =============================================================================
//
// Minimal command-line interface for Nix.js Kit. Supports:
//   nix-js-kit build   — run a production static build
//   nix-js-kit dev     — run a dev server that rebuilds on file changes
//   nix-js-kit preview — serve the static build in production mode
//   nix-js-kit start   — run an SSR server that renders pages on demand
//
// This is intentionally small: no generators, no config file parsing, just
// convention-based defaults overridable via CLI flags.
// =============================================================================

export interface CliOptions {
  command: "build" | "dev" | "preview" | "start" | "adapter" | "check" | "routes" | "doctor";
  adapterName?: "vercel" | "netlify" | "bun" | "node";
  root: string;
  appDir: string;
  islandsDir?: string;
  outDir: string;
  publicDir?: string;
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
  configFile?: string;
  resolvedConfig?: ResolvedNixConfig;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-?")) {
    printHelp();
    process.exit(0);
  }
  const command = args[0];
  if (
    command !== "build" &&
    command !== "dev" &&
    command !== "preview" &&
    command !== "start" &&
    command !== "adapter" &&
    command !== "check" &&
    command !== "routes" &&
    command !== "doctor"
  ) {
    throw new Error(`Usage: nix-js-kit <build|dev|preview|start|adapter|check|routes|doctor> [options]`);
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
  let publicDir = "public";
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
  let configFile: string | undefined;

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
      case "--public":
        publicDir = next;
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
      case "--config":
        configFile = next;
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
    publicDir: resolve(root, publicDir),
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
    configFile: configFile ? resolve(root, configFile) : undefined,
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
  check            Typecheck the project and validate route/config integrity
  routes           List all discovered routes and their metadata
  doctor           Diagnose common configuration and environment issues

Options:
  -r, --root <dir>          Project root (default: cwd)
  -a, --app <dir>           App directory relative to root (default: src/app)
  -i, --islands <dir>       Islands directory relative to root (default: src/islands)
  -o, --out <dir>           Output directory relative to root (default: dist)
  --public <dir>            Public directory relative to root (default: public)
  -p, --port <number>       Server port (default: 3000)
  -h, --host <address>      Server host (default: 127.0.0.1)
  -l, --lang <lang>         HTML lang attribute (default: es)
  --hydrate-import <spec>   Import specifier for hydrateIslands in generated entry
  --router-import <spec>    Import specifier for startClientRouter in generated entry
  --client-config <path>    Vite config used to build the client hydration bundle
  --config <path>           Nix config file (default: nix.config.ts/js/mjs)
  --cache-dir <dir>         Directory for ISR cache (only used by start)
  --default-revalidate <s>  Default ISR revalidate interval in seconds
`);
}

function toBuildConfig(options: CliOptions): BuildConfig {
  return {
    root: options.root,
    appDir: options.appDir,
    outDir: options.outDir,
    publicDir: options.publicDir,
    clientEntry: options.clientEntry,
    lang: options.lang,
    islandsDir: options.islandsDir,
    generatedEntry: options.generatedEntry,
    hydrateImport: options.hydrateImport,
    routerImport: options.routerImport,
    imageFormats: options.resolvedConfig?.images.formats,
  };
}

async function doBuild(options: CliOptions): Promise<void> {
  const transformedRoot = join(options.root, ".nix-js", "transformed");
  const transformedAppDir = transformedAppDirOf(options.root, options.appDir, options.islandsDir, transformedRoot);
  await transformProjectFiles({
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir,
    outDir: transformedRoot,
  });

  // Atomic output staging: build into a temp directory, then swap to the final
  // outDir so a crashed build never leaves a half-written dist.
  const { beginAtomicStage } = await import("./build/vite-build.js");
  const stage = await beginAtomicStage({ outDir: options.outDir });
  const tempOutDir = stage.tempDir;

  try {
    const buildConfig = toBuildConfig(options);
    buildConfig.appDir = transformedAppDir;
    buildConfig.outDir = tempOutDir;
    const result = await build(buildConfig);

    // Emit the portable application manifest and route types when a resolved
    // config is available. The manifest is the source of truth for adapters,
    // the client island registry and runtime route metadata.
    if (options.resolvedConfig) {
      try {
        const manifest = await createAppManifest(options.resolvedConfig);
        const manifestPath = join(tempOutDir, ".nix-js", "manifest.json");
        await writeAppManifest(manifest, manifestPath);
        const typesPath = join(options.root, ".nix-js", "routes.d.ts");
        await writeRouteTypes(manifest, typesPath);
        console.log(`  - manifest: ${relative(options.root, join(options.outDir, ".nix-js", "manifest.json"))}`);
      } catch (err) {
        console.warn("[nix-js-kit] manifest generation failed:", err);
      }
    }

    if (options.islandsDir && !options.clientConfig) {
      const autoConfig = await findClientConfig(options.root);
      if (autoConfig) {
        options.clientConfig = autoConfig;
      }
    }
    if (options.clientConfig) {
      // Temporarily redirect the client build to the staging directory.
      const originalOutDir = options.outDir;
      options.outDir = tempOutDir;
      try {
        await buildClient(options);
      } finally {
        options.outDir = originalOutDir;
      }
    }

    // Atomically swap the staged output into the final destination.
    await stage.commit();

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
  } catch (err) {
    await stage.rollback();
    throw err;
  }
}

const DEV_WORKER_ENV = "NIX_JS_KIT_DEV_WORKER";

async function doDev(options: CliOptions): Promise<void> {
  await doBuild(options);

  const transformedRoot = join(options.root, ".nix-js", "transformed");
  const transformedAppDir = transformedAppDirOf(options.root, options.appDir, options.islandsDir, transformedRoot);
  await transformProjectFiles({
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir,
    outDir: transformedRoot,
  });

  const actions = await scanActions(transformedAppDir);
  const routes = await scanRoutes(transformedAppDir);
  const server = createServer((req, res) => handleRequest(req, res, options, actions, routes, true));

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  server.listen(options.port, options.host, () => {
    console.log(`\n  → Dev server http://${options.host}:${options.port}`);
  });
}

/**
 * Dev supervisor: runs the actual dev server in a child process and restarts
 * it whenever app/islands source files change. A fresh process means a fresh
 * module registry, so edits to pages, loaders, layouts and islands are always
 * picked up (no stale ESM cache).
 */
async function doDevSupervisor(options: CliOptions): Promise<void> {
  // Re-invoke this bin with the same flags; the worker branch (env var set)
  // runs the actual server in a fresh process.
  const binPath = process.argv[1];
  const spawnPath = binPath && existsSync(binPath)
    ? binPath
    : fileURLToPath(import.meta.url);
  const args = process.argv.slice(2);

  let child: import("node:child_process").ChildProcess | null = null;
  let stopping = false;
  let intentional = false;
  let respawnTimer: ReturnType<typeof setTimeout> | null = null;

  const startWorker = () => {
    intentional = false;
    console.log("\n[dev] Starting dev server...");
    child = spawn(process.execPath, [spawnPath, ...args], {
      env: { ...process.env, [DEV_WORKER_ENV]: "1" },
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      child = null;
      if (stopping) return;
      if (intentional) {
        // Restart after a source change.
        respawnTimer = setTimeout(startWorker, 400);
        return;
      }
      if (code !== 0) {
        console.error(`[dev] Dev server exited with code ${code}; restarting...`);
        respawnTimer = setTimeout(startWorker, 600);
      }
    });
  };

  const restart = () => {
    if (!child) return;
    intentional = true;
    child.kill("SIGTERM");
  };

  const watchedDirs = [options.appDir, options.islandsDir].filter(Boolean) as string[];
  if (watchedDirs.length > 0) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRestart = () => {
      console.log("\n[change] Restarting dev server...");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => restart(), 150);
    };
    for (const dir of watchedDirs) {
      try {
        watch(dir, { recursive: true }, (event, filename) => {
          // Editors and sed replace files via atomic rename, which reports the
          // temporary name (e.g. "blog/sed1234") instead of the .ts file, so
          // treat every rename as a potential source change. "change" events
          // only restart when the reported name looks like a source file.
          if (event === "rename") {
            scheduleRestart();
          } else if (filename && /\.ts$/.test(filename)) {
            scheduleRestart();
          }
        });
      } catch (err) {
        console.error(`[dev] failed to watch ${dir}:`, err);
      }
    }
  }

  const cleanup = () => {
    stopping = true;
    if (respawnTimer) clearTimeout(respawnTimer);
    if (child) child.kill("SIGTERM");
    // Exit after the worker has gone, so a new supervisor can take over the port.
    const deadline = setTimeout(() => process.exit(0), 3000);
    deadline.unref();
    if (!child) process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  startWorker();
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

  const transformedRoot = join(options.root, ".nix-js", "preview-transformed");
  const transformedAppDir = transformedAppDirOf(options.root, options.appDir, options.islandsDir, transformedRoot);
  await transformProjectFiles({
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir,
    outDir: transformedRoot,
  });

  const actions = await scanActions(transformedAppDir);
  const routes = await scanRoutes(transformedAppDir);
  const server = createServer((req, res) => handleRequest(req, res, options, actions, routes));
  server.listen(options.port, options.host, () => {
    console.log(`\n  → Preview server http://${options.host}:${options.port}`);
  });
  return server;
}

async function doStart(options: CliOptions): Promise<void> {
  const transformedRoot = join(options.root, ".nix-js", "transformed");
  const transformedAppDir = transformedAppDirOf(options.root, options.appDir, options.islandsDir, transformedRoot);
  await transformProjectFiles({
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir,
    outDir: transformedRoot,
  });

  const ssr = await createSsrServer({
    root: options.root,
    appDir: transformedAppDir,
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

async function buildClient(options: CliOptions): Promise<void> {
  if (!options.clientConfig) return;

  // Use the programmatic Vite build API instead of spawnSync("npx", ["vite", ...]).
  // This avoids child-process overhead, shares the module cache, and gives us
  // structured errors instead of exit-code parsing.
  const { buildClientBundle } = await import("./build/vite-build.js");
  const clientOutDir = join(options.outDir, "_nix-js");
  // The client bundle is always served from /_nix-js/ regardless of the
  // project's deployment base. The deployment base is applied to page HTML,
  // not to the internal hydration bundle path.
  const clientBase = "/_nix-js/";
  await buildClientBundle({
    root: options.root,
    userConfigPath: resolve(options.clientConfig),
    appDir: join(options.root, "src", "app"),
    islandsDir: join(options.root, "src", "islands"),
    outDir: clientOutDir,
    base: clientBase,
    logPrefix: "[client]",
  });
}

async function handleRequest(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  options: CliOptions,
  actions: import("./action/scan.js").ActionRegistry,
  routes: import("./router/route-scanner.js").ScannedRoutes,
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
      const request = incomingMessageToRequest(req, body);
      const response = await handleActionRequest(request, createActionResolver(actions, routes));
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
    const { renderPageBody, RouteNotFoundError } = await import("./ssr/stream.js");
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const page = url.searchParams.get("page") ?? "/";
      const search = url.searchParams.get("search") ?? "";
      const wantsJson = (req.headers["accept"] ?? "").includes("application/json");
      const request = incomingMessageToRequest(req);
      const { body, title } = await renderPageBody({
        routes,
        pathname: page,
        searchParams: new URLSearchParams(search),
        config: { lang: options.lang, clientEntry: options.clientEntry },
        actions: publicActions,
        request,
      });
      if (wantsJson) {
        res.writeHead(200, cacheHeaders({ "Content-Type": "application/json; charset=utf-8" }));
        res.end(JSON.stringify({ title, body }));
      } else {
        res.writeHead(200, cacheHeaders({ "Content-Type": "text/html; charset=utf-8" }));
        res.end(body);
      }
    } catch (err) {
      if (err instanceof RouteNotFoundError) {
        res.writeHead(404, cacheHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
        res.end("Not Found");
        return;
      }
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
      const request = incomingMessageToRequest(req, body);
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
  const filePath = await resolveStaticFile(options.outDir, urlPath);
  if (filePath) {
    try {
      const data = await readFile(filePath);
      const contentType = guessContentType(filePath);
      if (noCache && contentType.includes("text/html")) {
        // Dev mode: strip the render-endpoint marker so the client router uses
        // the (live) `/__nix-js/render` endpoint for fast SPA navigation.
        const stripped = data
          .toString("utf8")
          .replace('<meta name="nix-js:render-endpoint" content="off" />', "");
        res.writeHead(200, cacheHeaders({ "Content-Type": contentType }));
        res.end(stripped);
        return;
      }
      res.writeHead(200, cacheHeaders({ "Content-Type": contentType }));
      res.end(data);
      return;
    } catch (err) {
      res.writeHead(500, cacheHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      res.end(String(err));
      return;
    }
  }

  // Fallback: try to render the route dynamically (e.g. for slugs not generated as static files).
  const { renderPage, renderErrorPage } = await import("./ssr/render.js");
  try {
    const match = matchRoute(originalPath, routes.pages);
    if (!match) {
      const errorResult = await renderErrorPage({
        routes,
        status: 404,
        config: { lang: options.lang, clientEntry: options.clientEntry },
        actions: publicActions,
      });
      if (errorResult) {
        res.writeHead(errorResult.status, cacheHeaders({ "Content-Type": "text/html; charset=utf-8" }));
        res.end(errorResult.html);
        return;
      }
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
      request: incomingMessageToRequest(req),
    });
    res.writeHead(200, cacheHeaders({ "Content-Type": "text/html; charset=utf-8" }));
    res.end(result.html);
  } catch (err) {
    console.error("[nix-js-kit] preview fallback render error:", err);
    const errorResult = await renderErrorPage({
      routes,
      status: 500,
      config: { lang: options.lang, clientEntry: options.clientEntry },
      actions: publicActions,
    }).catch(() => undefined);
    if (errorResult) {
      res.writeHead(errorResult.status, cacheHeaders({ "Content-Type": "text/html; charset=utf-8" }));
      res.end(errorResult.html);
      return;
    }
    res.writeHead(500, cacheHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    res.end(String(err));
  }
}

function createActionResolver(
  actions: import("./action/scan.js").ActionRegistry,
  routes: import("./router/route-scanner.js").ScannedRoutes,
) {
  return async (name: string, page?: string) => {
    const pageKey = page
      ? routes.pages.some((route) => route.path === page)
        ? page
        : (matchRoute(page, routes.pages)?.route.path ?? page)
      : undefined;
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
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}

async function doAdapter(options: CliOptions): Promise<void> {
  const adapterOptions = {
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir ?? resolve(options.root, "src/islands"),
    outDir: options.outDir,
    publicDir: options.publicDir,
    clientEntry: options.clientEntry,
    lang: options.lang,
    hydrateImport: options.hydrateImport,
  };
  if (options.adapterName === "vercel") {
    const { vercelAdapter } = await import("./adapters/vercel.js");
    await vercelAdapter.build(adapterOptions);
    console.log("\n  → Vercel output generated at .vercel/output");
  } else if (options.adapterName === "netlify") {
    const { netlifyAdapter } = await import("./adapters/netlify.js");
    await netlifyAdapter.build(adapterOptions);
    console.log("\n  → Netlify output generated at netlify/functions/__nix-js-kit.mjs");
  } else if (options.adapterName === "bun") {
    const { bunAdapter } = await import("./adapters/bun.js");
    await bunAdapter.build(adapterOptions);
    console.log("\n  → Bun server generated at .nix-js/bun-server.ts");
  } else if (options.adapterName === "node") {
    const { nodeAdapter } = await import("./adapters/node.js");
    await nodeAdapter.build(adapterOptions);
    console.log("\n  → Node server generated at .nix-js/node-server.mjs");
  }
}

async function applyProjectConfig(options: CliOptions, argv: string[]): Promise<void> {
  // Map non-build commands to "build" or "serve" for config resolution.
  const command = (options.command === "adapter" || options.command === "routes" || options.command === "doctor")
    ? "build"
    : options.command;
  const config = await loadNixConfig({
    root: options.root,
    configFile: options.configFile,
    command,
  });
  const args = argv.slice(2);
  const has = (...names: string[]) => names.some((name) => args.includes(name));
  options.root = config.root;
  if (!has("--app", "-a")) options.appDir = config.appDir;
  if (!has("--islands", "-i")) options.islandsDir = config.islandsDir;
  if (!has("--out", "-o")) options.outDir = config.outDir;
  if (!has("--public")) options.publicDir = config.publicDir;
  if (!has("--cache-dir")) options.cacheDir = config.cache.dir;
  if (!has("--default-revalidate")) options.defaultRevalidate = config.cache.defaultRevalidate;
  options.generatedEntry = resolve(config.root, ".nix-js/entry-client.ts");
  options.resolvedConfig = config;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseArgs(argv);

  // Commands that don't need project config resolution.
  if (options.command === "doctor") {
    const { doDoctor } = await import("./cli/commands.js");
    const code = await doDoctor(options);
    process.exit(code);
  }

  await applyProjectConfig(options, argv);

  if (options.command === "build") {
    await doBuild(options);
  } else if (options.command === "preview") {
    await doPreview(options);
  } else if (options.command === "start") {
    await doStart(options);
  } else if (options.command === "adapter") {
    await doAdapter(options);
  } else if (options.command === "check") {
    const { doCheck } = await import("./cli/commands.js");
    const code = await doCheck(options);
    process.exit(code);
  } else if (options.command === "routes") {
    const { doRoutes } = await import("./cli/commands.js");
    const code = await doRoutes(options);
    process.exit(code);
  } else if (process.env[DEV_WORKER_ENV] === "1") {
    await doDev(options);
  } else {
    await doDevSupervisor(options);
  }
}
