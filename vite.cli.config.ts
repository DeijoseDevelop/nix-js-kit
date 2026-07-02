import { defineConfig } from "vite";
import { resolve } from "path";

// ── CLI build configuration ─────────────────────────────────────────────────
//
//   npm run build:cli
//
// Produces a single self-contained CommonJS-compatible bundle for the CLI.
// It is kept separate from the library build so Node built-ins are not mixed
// with code-split library chunks that get mangled by terser.

export default defineConfig({
    publicDir: false,

    build: {
        outDir: "dist/lib",
        emptyOutDir: false,
        sourcemap: true,
        minify: false,
        ssr: true,

        lib: {
            entry: resolve("src/cli.ts"),
            name: "NixJSKitCli",
            formats: ["es"],
            fileName: () => "cli.js",
        },

        rollupOptions: {
            external: ["@deijose/nix-js", "happy-dom"],
            output: {
                codeSplitting: false,
            },
        },
    },
});
