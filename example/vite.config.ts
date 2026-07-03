import { defineConfig } from "vite";
import { nixKit } from "@deijose/nix-js-kit/vite";

export default defineConfig({
  plugins: [
    nixKit({
      appDir: "src/app",
      islandsDir: "src/islands",
      generatedEntry: ".nix-js/entry-client.ts",
      clientEntry: "/_nix-js/entry-client.js",
      lang: "es",
    }),
  ],
});
