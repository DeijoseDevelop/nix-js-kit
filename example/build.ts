import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.ts";

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  await run([
    "",
    "",
    "build",
    "--root",
    here,
    "--hydrate-import",
    "../../src/island/index.ts",
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
