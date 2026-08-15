import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, relative, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync, watch } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, type BuildConfig } from "./build/build.js";
import { transformProjectFiles, transformedAppDir as transformedAppDirOf } from "./build/transform-source.js";
import { createSsrServer } from "./ssr/server.js";
import { scanActions, actionNames } from "./action/scan.js";
import { scanRoutes } from "./router/route-scanner.js";
import { matchRoute, matchApiRoute } from "./ssr/match.js";
import { handleActionRequest } from "./action/server.js";

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
  const transformedRoot = join(options.root, ".nix-js", "transformed");
  const transformedAppDir = transformedAppDirOf(options.root, options.appDir, options.islandsDir, transformedRoot);
  await transformProjectFiles({
    root: options.root,
    appDir: options.appDir,
    islandsDir: options.islandsDir,
    outDir: transformedRoot,
  });
  const buildConfig = toBuildConfig(options);
  buildConfig.appDir = transformedAppDir;
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

  const transformedRoot = join(options.outDir, ".nix-js-transformed");
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

function buildClient(options: CliOptions): void {
  if (!options.clientConfig) return;
  console.log("[client] Building hydration bundle...");

  // Wrap the user's Vite config so the attribute-interpolation plugin is
  // applied to app/islands sources in the client bundle. Without it, partial
  // interpolations like href="/movies/${slug}" inside islands would reach the
  // browser untransformed and break hydration.
  const wrapperPath = join(options.root, ".nix-js", "vite.client.config.mjs");
  try {
    mkdirSync(dirname(wrapperPath), { recursive: true });
    writeFileSync(
      wrapperPath,
      [
        `import user from ${JSON.stringify(resolve(options.clientConfig))};`,
        `import { nixJsInterpolationPlugin } from "@deijose/nix-js-kit/vite";`,
        `const base = typeof user === "function" ? await user({ command: "build", mode: "production" }) : user;`,
        `const resolved = base && typeof base.then === "function" ? await base : base;`,
        `export default {`,
        `  ...(resolved ?? {}),`,
        `  plugins: [...(resolved?.plugins ?? []), nixJsInterpolationPlugin({`,
        `    appDir: ${JSON.stringify(join(options.root, "src", "app"))},`,
        `    islandsDir: ${JSON.stringify(join(options.root, "src", "islands"))},`,
        `  })],`,
        `};`,
        ``,
      ].join("\n"),
      "utf8",
    );
  } catch (err) {
    console.error("[client] Failed to write wrapped client config:", err);
  }

  const result = spawnSync("npx", ["vite", "build", "--config", wrapperPath], {
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
      const headers = new Headers();
      const contentType = req.headers["content-type"];
      const accept = req.headers["accept"];
      const cookie = req.headers["cookie"];
      if (contentType) headers.set("Content-Type", contentType);
      if (accept) headers.set("Accept", accept);
      if (cookie) headers.set("Cookie", cookie);
      const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
        method: "POST",
        headers,
        body,
      });
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
      const { body, title } = await renderPageBody({
        routes,
        pathname: page,
        searchParams: new URLSearchParams(search),
        config: { lang: options.lang, clientEntry: options.clientEntry },
        actions: publicActions,
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
  } else if (process.env[DEV_WORKER_ENV] === "1") {
    await doDev(options);
  } else {
    await doDevSupervisor(options);
  }
}
