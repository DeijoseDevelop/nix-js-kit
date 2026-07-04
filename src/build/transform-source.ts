import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { transformPartialInterpolations } from "../vite/interpolation-plugin";

export interface TransformProjectOptions {
  root: string;
  appDir: string;
  islandsDir?: string;
  outDir: string;
}

/**
 * Copy app (and optionally islands) source files to a transformed directory,
 * rewriting partial Nix.js attribute interpolations so they can be imported
 * by the SSG/SSR build without requiring manual syntax changes.
 */
async function collectTsFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectTsFiles(path)));
      } else if (entry.isFile() && extname(path) === ".ts") {
        files.push(path);
      }
    }
    return files;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }
}

export async function transformProjectFiles(options: TransformProjectOptions): Promise<void> {
  const { root, appDir, islandsDir, outDir } = options;
  const dirs = islandsDir ? [appDir, islandsDir] : [appDir];
  const files: string[] = [];
  for (const dir of dirs) {
    files.push(...(await collectTsFiles(resolve(root, dir))));
  }

  for (const file of files) {
    const source = await readFile(file, "utf8");
    let output = source;
    if (source.includes("html`")) {
      const transformed = transformPartialInterpolations(source);
      if (transformed !== source) {
        output = transformed;
      }
    }
    const rel = relative(resolve(root, appDir), file);
    const outFile = resolve(outDir, rel);
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, output, "utf8");
  }
}
