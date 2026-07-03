import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, resolve, relative } from "node:path";
import { watch } from "node:fs";
import { spawnSync } from "node:child_process";
import { build, type BuildConfig } from "./build/build";
import { createSsrServer } from "./ssr/server";

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
  command: "build" | "dev" | "preview" | "start";
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
  /**
   * Path to a Vite config used to build the client hydration bundle.
   * In dev mode it is rebuilt whenever source files change.
   */
  clientConfig?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-?")) {
    printHelp();
    process.exit(0);
  }
  const command = args[0];
  if (command !== "build" && command !== "dev" && command !== "preview" && command !== "start") {
    throw new Error(`Usage: nix-js-kit <build|dev|preview|start> [options]`);
  }

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
  let clientConfig: string | undefined;

  for (let i = 1; i < args.length; i++) {
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
      case "--client-config":
        clientConfig = next;
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
    clientConfig: clientConfig ? resolve(root, clientConfig) : undefined,
  };
}

function printHelp(): void {
  console.log(`
nix-js-kit <command> [options]

Commands:
  build    Run a static site build
  dev      Run a development server with rebuild-on-change
  preview  Serve the static build in production mode
  start    Run an SSR server that renders pages on demand

Options:
  -r, --root <dir>          Project root (default: cwd)
  -a, --app <dir>           App directory relative to root (default: src/app)
  -i, --islands <dir>       Islands directory relative to root (default: src/islands)
  -o, --out <dir>           Output directory relative to root (default: dist)
  -p, --port <number>       Server port (default: 3000)
  -h, --host <address>      Server host (default: 127.0.0.1)
  -l, --lang <lang>         HTML lang attribute (default: es)
  --hydrate-import <spec>   Import specifier for hydrateIslands in generated entry
  --client-config <path>    Vite config used to build the client hydration bundle
`);
}

function toBuildConfig(options: CliOptions): BuildConfig {
  return {
    appDir: options.appDir,
    outDir: options.outDir,
    clientEntry: options.clientEntry,
    lang: options.lang,
    islandsDir: options.islandsDir,
    generatedEntry: options.generatedEntry,
    hydrateImport: options.hydrateImport,
  };
}

async function doBuild(options: CliOptions): Promise<void> {
  const result = await build(toBuildConfig(options));

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

  const server = createServer((req, res) => handleRequest(req, res, options));
  server.listen(options.port, options.host, () => {
    console.log(`\n  → Dev server http://${options.host}:${options.port}`);
  });

  watchFiles(options, server);
}

async function doPreview(options: CliOptions): Promise<void> {
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

  const server = createServer((req, res) => handleRequest(req, res, options));
  server.listen(options.port, options.host, () => {
    console.log(`\n  → Preview server http://${options.host}:${options.port}`);
  });
}

async function doStart(options: CliOptions): Promise<void> {
  const ssr = await createSsrServer({
    appDir: options.appDir,
    publicDir: options.outDir,
    clientEntry: options.clientEntry,
    lang: options.lang,
    port: options.port,
    host: options.host,
  });
  await ssr.listen();
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
): Promise<void> {
  let urlPath = req.url ?? "/";
  if (urlPath.includes("?")) urlPath = urlPath.split("?")[0];
  if (urlPath.endsWith("/")) urlPath += "index.html";
  if (extname(urlPath) === "") urlPath += "/index.html";
  if (urlPath.startsWith("/")) urlPath = urlPath.slice(1);

  const filePath = join(options.outDir, urlPath);

  try {
    const data = await readFile(filePath);
    const contentType = guessContentType(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Not found: ${req.url}`);
    } else {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(String(err));
    }
  }
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

export async function run(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  if (options.command === "build") {
    await doBuild(options);
  } else if (options.command === "preview") {
    await doPreview(options);
  } else if (options.command === "start") {
    await doStart(options);
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
