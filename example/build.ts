import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const result = await build({
    appDir: join(here, "src/app"),
    outDir: join(here, "dist"),
    clientEntry: "/_nix-js/entry-client.js",
    lang: "es",
    islandsDir: join(here, "src/islands"),
    generatedEntry: join(here, ".nix-js/entry-client.ts"),
    // Example builds against the local source; published apps use the default
    // "@deijose/nix-js-kit/island".
    hydrateImport: "../../src/island/index.ts",
  });

  console.log(`✓ Build completo: ${result.pages} páginas generadas`);
  for (const file of result.files) {
    console.log("  -", file.replace(here + "/", ""));
  }
  if (result.islands.length > 0) {
    console.log(`\n✓ ${result.islands.length} island(s) detectada(s):`);
    for (const island of result.islands) {
      console.log("  -", island.name);
    }
    if (result.generatedEntry) {
      console.log("  entry:", result.generatedEntry.replace(here + "/", ""));
    }
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
