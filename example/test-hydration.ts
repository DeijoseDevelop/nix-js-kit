import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Smoke test: verifies that the generated static HTML contains the island
// marker and that the client entry bundle can be imported and executed in a
// happy-dom environment without throwing. Full click/reactivity verification
// requires a real browser (happy-dom does not fully emulate Nix.js event
// delegation + signal batching).

const here = dirname(fileURLToPath(import.meta.url));

const MANAGED_GLOBALS = [
  "window", "document", "navigator", "location", "history", "screen",
  "HTMLElement", "Element", "Node", "Text", "Comment", "DocumentFragment",
  "ShadowRoot", "Event", "CustomEvent", "MutationObserver", "IntersectionObserver",
  "NodeFilter", "TreeWalker", "requestIdleCallback", "cancelIdleCallback",
];

const html = readFileSync(join(here, "dist/index.html"), "utf8");
const window = new Window({ url: "http://localhost:3000/" });
const g = globalThis as Record<string, unknown>;

for (const key of MANAGED_GLOBALS) {
  if (key in window) {
    g[key] = (window as unknown as Record<string, unknown>)[key];
  }
}

window.document.documentElement.innerHTML = html;

const marker = window.document.querySelector("[data-nix-island]") as HTMLElement | null;
if (!marker) {
  throw new Error("Island marker not found in generated HTML");
}
if (marker.dataset.nixIsland !== "LikeButton") {
  throw new Error(`Expected island "LikeButton", got "${marker.dataset.nixIsland}"`);
}

// Load and execute the client entry bundle. It hydrates islands on import.
await import("./dist/_nix-js/entry-client.js" as string);

const button = window.document.querySelector(".like-button");
if (!button) {
  throw new Error("LikeButton island not rendered after hydration");
}

console.log("✓ Hydration smoke test passed");
