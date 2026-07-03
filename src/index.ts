// =============================================================================
// --- @deijose/nix-js-kit — public API (v0.1) ---
// =============================================================================

export type {
  RouteParams,
  PageProps,
  LayoutProps,
  LoadContext,
  PageDataLoad,
  GenerateStaticParams,
} from "./types";

export { renderToString } from "./render/render-to-string";
export { documentShell, type ShellOptions } from "./build/document-shell";
export { build, scanRoutes, type BuildConfig, type BuildResult } from "./build/build";
export type { PageRoute, ScannedRoutes, ApiRoute } from "./router/route-scanner";
export { island, type IslandComponent, type IslandDirective } from "./island/island";
export { hydrateIslands, type IslandRegistry } from "./island/hydrate";
export { scanIslands, type IslandModule } from "./island/scan";
export {
  generateClientEntry,
  buildEntrySource,
  type GenerateEntryOptions,
} from "./island/generate-entry";
export { matchRoute, type MatchResult } from "./ssr/match";
export { renderPage, type RenderPageOptions } from "./ssr/render";
export { createSsrServer, type SsrServer, type SsrServerOptions } from "./ssr/server";
export { run, type CliOptions } from "./cli";
export type { Adapter, AdapterOptions } from "./adapters/index";
export { vercelAdapter } from "./adapters/vercel";
export { netlifyAdapter } from "./adapters/netlify";
