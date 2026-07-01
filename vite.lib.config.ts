import { defineConfig } from "vite";
import { resolve } from "path";

// ── Library build configuration ───────────────────────────────────────────────
//
//   npm run build:lib
//
// Produces:
//   dist/lib/nix-js-kit.js      — ES module  (primary)
//   dist/lib/nix-js-kit.cjs     — CommonJS   (legacy Node.js / bundlers)
//   dist/lib/*.d.ts             — Type declarations (generated separately by tsc)

export default defineConfig({
    publicDir: false,

    build: {
        outDir: "dist/lib",
        emptyOutDir: true,
        sourcemap: true,

        lib: {
            entry: resolve("src/index.ts"),
            name: "NixJSKit",
            formats: ["es", "cjs"],
            fileName: (format) =>
                format === "cjs" ? "nix-js-kit.cjs" : "nix-js-kit.js",
        },

        rollupOptions: {
            external: ["@deijose/nix-js", "happy-dom"],
            output: {
                preserveModules: false,
                globals: {
                    "@deijose/nix-js": "NixJS",
                    "happy-dom": "HappyDOM",
                },
            },
        },
    },
});
