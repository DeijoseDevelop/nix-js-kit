// =============================================================================
// --- @deijose/nix-js-kit — public API (v0.1) ---
// =============================================================================

export type {
  RouteParams,
  PageProps,
  LayoutProps,
  LoadContext,
  PageDataLoad,
} from "./types";

export { renderToString } from "./render/render-to-string";
export { documentShell, type ShellOptions } from "./build/document-shell";
export { build, scanRoutes, type BuildConfig, type BuildResult } from "./build/build";
export type { PageRoute, ScannedRoutes, ApiRoute } from "./router/route-scanner";
