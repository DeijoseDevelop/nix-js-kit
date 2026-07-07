// =============================================================================
// --- @deijose/nix-js-kit/island ---
// =============================================================================
//
// Client-only entry point. Import `hydrateIslands` from here in your entry-client
// so the client bundle does not pull in server-only code (route scanner, build
// orchestrator, happy-dom, etc.).
//
// Server-side pages should import `island()` from the main package instead.
// =============================================================================

export { hydrateIslands, cleanupHydratedIslands, type IslandRegistry } from "./hydrate";
export type { IslandComponent, IslandDirective } from "./island";
