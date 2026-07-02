import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, "dist/_nix-js"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/entry-client.ts"),
      output: {
        entryFileNames: "entry-client.js",
        format: "es",
      },
    },
  },
});
