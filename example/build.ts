import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const result = await build({
    appDir: join(here, "src/app"),
    outDir: join(here, "dist"),
    clientEntry: "/_nix/entry-client.js",
    lang: "es",
  });

  console.log(`✓ Build completo: ${result.pages} páginas generadas`);
  for (const file of result.files) {
    console.log("  -", file.replace(here + "/", ""));
  }
  if (result.skipped.length > 0) {
    console.log("\nRutas dinámicas omitidas (necesitan generateStaticParams):");
    for (const path of result.skipped) {
      console.log("  -", path);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
