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
  PageMetadata,
  OpenGraphMetadata,
  TwitterMetadata,
  MetadataContext,
  GenerateMetadata,
} from "./types.js";

export { renderToString } from "./render/render-to-string.js";
export { documentShell, buildHeadTags, type ShellOptions } from "./build/document-shell.js";
export { build, scanRoutes, type BuildConfig, type BuildResult } from "./build/build.js";
export type { PageRoute, ScannedRoutes, ApiRoute } from "./router/route-scanner.js";
export { island, type IslandComponent, type IslandDirective } from "./island/island.js";
export { hydrateIslands, type IslandRegistry } from "./island/hydrate.js";
export { scanIslands, type IslandModule } from "./island/scan.js";
export {
  generateClientEntry,
  buildEntrySource,
  type GenerateEntryOptions,
} from "./island/generate-entry.js";
export { matchRoute, matchApiRoute, type MatchResult, type ApiMatchResult } from "./ssr/match.js";
export { renderPage, renderErrorPage, collectShellExtras, type RenderPageOptions, type RenderPageResult, type RenderErrorPageOptions } from "./ssr/render.js";
export { renderStreamingPage, renderPageBody, type StreamingPageOptions, type RenderPageBodyOptions } from "./ssr/stream.js";
export { getCachedHtml, setCachedHtml, clearCache, type CacheEntry } from "./cache.js";
export { createSsrServer, type SsrServer, type SsrServerOptions } from "./ssr/server.js";
export { callAction, type ActionRequest } from "./action/index.js";
export { handleActionRequest, type ActionResolver, type ActionSecurityOptions } from "./action/server.js";
export { verifyOrigin, originForbidden, type OriginCheckOptions } from "./action/origin.js";
export {
  encodeActionErrorCookie,
  decodeActionErrorCookie,
  setActionErrorCookieHeader,
  clearActionErrorCookieHeader,
  ACTION_ERROR_COOKIE,
} from "./action/error-store.js";
export { scanActions } from "./action/scan.js";
export { fail, redirect, ActionFailure, RedirectResponse } from "./errors.js";
export type { Adapter, AdapterOptions } from "./adapters/index.js";
export { vercelAdapter } from "./adapters/vercel.js";
export { netlifyAdapter } from "./adapters/netlify.js";
export { bunAdapter } from "./adapters/bun.js";
export { nodeAdapter } from "./adapters/node.js";
export { startClientRouter } from "./router/client.js";
export { image, consumeImageRegistry, type ImageOptions, type ImageFormat } from "./image/index.js";
export { processImages, isSharpAvailable, type PipelineOptions, type ProcessedImage } from "./image/pipeline.js";
export {
  loadMiddleware,
  matchesMiddleware,
  runMiddleware,
  type Middleware,
  type MiddlewareConfig,
  type MiddlewareContext,
  type LoadedMiddleware,
  type MiddlewareResult,
} from "./middleware/index.js";
export { streamBoundary, type StreamBoundaryOptions } from "./middleware/stream-boundary.js";
