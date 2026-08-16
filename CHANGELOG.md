# Changelog

All notable changes to `@deijose/nix-js-kit` will be documented in this file.

## 1.4.3

### Fixed

- **Pinned `@deijose/nix-js` to 2.6.0** — fixed a build error on Vercel where `^2.5.3` resolved to a newer version that no longer exports `_setSSR`.

## 1.4.2

### Fixed

- **Hash link navigation** — the SPA router now handles `#anchor` links with smooth scroll instead of ignoring them or reloading the page.
- **Scrollable element preservation** — elements marked with `data-scroll-preserve="key"` have their scroll position saved and restored across SPA navigations, preventing sidebar scroll resets.

## 1.4.1

### Fixed

- **JSON-LD in headScripts** — `documentShell` now detects when a `headScript` is already a complete `<script>` tag (e.g. `<script type="application/ld+json">...`) and renders it as-is instead of wrapping it in another `<script>` tag.

## 1.4.0

### Added

- **SEO module** (`@deijose/nix-js-kit/seo`) — sitemap.xml, robots.txt, and JSON-LD structured data generation:
  - `generateSitemap({ siteUrl, urls, outDir })` writes a valid `sitemap.xml` from a list of URL entries (supports `lastmod`, `changefreq`, `priority`).
  - `generateRobots({ siteUrl, outDir, rules?, disallow? })` writes a `robots.txt` with per-user-agent rules and automatic sitemap reference.
  - `jsonLd(schema)` serializes Schema.org structured data into a `<script type="application/ld+json">` tag for rich snippets.
  - Full TypeScript types for all config objects.

## 1.3.1

### Fixed

- **SPA router FOUC fix** — stylesheets (`<link rel="stylesheet">`) and `<style>` tags rendered inside `#app` by layouts are now hoisted to `<head>` on page load and before every SPA navigation, preventing flash-of-unstyled-content on route changes.
- **`headScripts` deduplication** — `collectShellExtras()` now deduplicates `headScripts` from page and layout data, preventing duplicate inline scripts (e.g. anti-flash theme scripts) when both layers emit the same script.

## 1.3.0

### Added

- **CSRF protection for server actions** — `verifyOrigin()` checks the `Origin`/`Referer` header against the `Host` header with optional `allowedOrigins` and `strictOrigin` mode. Configured via `actionSecurity` in the Vite plugin and SSR server options.
- **Action error cookie store** — action failure data is now stored in an ephemeral `__nix_js_action_error` cookie (SameSite=Lax, Max-Age=15s) instead of URL query parameters, improving security and privacy. `props.form` is populated from the cookie and cleared on the next response.
- **Metadata API** — pages can export `generateMetadata(context)` or return a `metadata` field from loaders/layouts. Supports `title`, `description`, `canonical`, `openGraph`, `twitter`, `robots`, and `other` fields. Head tags are marked with `data-nix-js-head` for SPA head merge.
- **Head merge in SPA router** — the client router swaps `<head>` tags marked with `data-nix-js-head` on every navigation, keeping metadata in sync with the current page.
- **Scroll restoration** — the client router saves and restores scroll position per path on `popstate`, so back/forward navigation feels native.
- **Content layer** (`@deijose/nix-js-kit/content`) — typed Markdown collections with YAML frontmatter:
  - `defineCollection({ schema })` for typed frontmatter validation (optional `zod` peer dep).
  - `getCollection(name)`, `getEntry(collection, slug)`, `getEntries(collection, slugs)` for querying content.
  - `renderEntryHTML(entry)` renders Markdown to HTML via `marked` (optional peer dep).
  - Built-in YAML frontmatter parser (strings, numbers, booleans, dates, inline/block arrays) — zero dependencies.
  - `raw(html)` helper for injecting trusted HTML without escaping (e.g. rendered Markdown).
  - HMR for `.md` files in the Vite dev server.
  - `src/content/config.ts` convention for collection definitions.
- **Image optimization** (`@deijose/nix-js-kit/image`):
  - `image()` helper emits responsive `<img>` with `srcset`, `sizes`, `loading="lazy"`, `decoding="async"`, `fetchpriority`, and `width`/`height` to prevent CLS.
  - Build-time pipeline with `sharp` (optional peer dep) generates WebP/AVIF variants at multiple widths with content-based hashing.
  - `processImages()` API for programmatic access; integrated into `build()` via `consumeImageRegistry()`.
  - `BuildConfig.publicDir` and `BuildConfig.imageFormats` options; `BuildResult.imagesProcessed` reports variant count.
- **Link prefetch** — the client router prefetches pages on viewport intersection (IntersectionObserver) and on hover/focus, with a 30s TTL cache. Respects `data-no-prefetch` attribute on individual links.
- **View Transitions API** — the client router uses `document.startViewTransition()` for smooth page transitions when available, with automatic `prefers-reduced-motion` respect.
- **Middleware** — `src/middleware.ts` convention with `config.matcher` for path filtering. Supports `:param` and `:param*` patterns. Return a `Response` to short-circuit (redirect, 401, etc.) or call `next()` to continue. Integrated into SSR server and Vite plugin.
- **Stream boundary** (experimental) — `streamBoundary()` wraps a promise with a loading fallback for out-of-order streaming during SSR.

### Changed

- Action error data moved from URL query params to ephemeral cookies (`__nix_js_action_error`) for security and privacy.
- Head tags use `data-nix-js-head` attribute (was `data-nix-head` internally) for consistent `nix-js` naming.
- `BuildResult` now includes `imagesProcessed` count.
- `SsrServerOptions` includes `actionSecurity` for CSRF configuration.
- `NixJsKitViteOptions` includes `actionSecurity`, `contentDir` for content layer root.
- TypeScript upgraded to 7.0.2 (native Go compiler, 10x faster builds). `baseUrl` removed from `tsconfig.json` (deprecated in TS 7); `paths` now resolve relative to the config file.
- `marked`, `zod`, and `sharp` added as optional peer dependencies via `peerDependenciesMeta`.

## 1.2.7

### Changed

- All identifiers now use the `nix-js` / `nixJs` naming consistently. Public API: `nixAction` is now `nixJsAction` (and the `NixAction` interface is `NixJsAction`). Form protocol fields are now `__nix_js_action_name`, `__nix_js_action_page`, `__nix_js_action_failure`, `__nix_js_action_redirect` and `__nix_js_action_error`; island DOM markers use `__nix_js_island_dispose`. The default document title is `Nix.js Kit App`.

## 1.2.6

### Added

- `fail()` and `redirect()` now accept both argument orders (`fail(400, data)` or `fail(data, 400)`, `redirect(303, "/x")` or `redirect("/x")`) and are detected via marker fields, so they work even when the CLI/adapters are bundled separately from the user's action modules.
- Source transform (`transformProjectFiles`) mirrors the project layout and compensates relative imports that escape the mirrored tree, so apps importing outside `src/` (e.g. the kit's own example) build correctly.
- Vite plugin now serves the `/__nix-js/render` endpoint (HTML or JSON) used by the SPA router and streaming boundaries.
- ISR now also caches the `/__nix-js/render` endpoint, so streamed pages (with `loading.ts`) regenerate on their `revalidate` TTL instead of being skipped.
- Data loaders (page and layouts) can return a top-level `htmlAttributes` object to set attributes on the `<html>` element of the document shell (e.g. `{ "data-theme": "dark" }`), applied in SSG, SSR and streaming shells — useful for themes persisted via cookie that must survive redirects.
- Data loaders can also return `headScripts: string[]`: inline scripts injected into `<head>` that run synchronously before the first paint and before the deferred client bundle. This is the standard no-flash bootstrap (e.g. applying a stored theme to static pages whose SSG shell was baked with the build-time theme).
- The client router now exports `navigateTo(pathname, search, push)`: a programmatic SPA navigation that fetches the fresh page body from `/__nix-js/render`, swaps `#app`, updates the title and re-hydrates islands. Server actions can use it after a redirect to show fresh server data (e.g. a new review) without a full reload that would serve a stale static page.

### Fixed

- CLI bin re-executes itself under the Bun runtime for bun-managed projects, so apps using `bun:sqlite` work with `nix-js-kit build/dev/start/preview`.
- Attribute interpolation plugin: rewritten with a proper template scanner. Handles nested braces/strings in expressions, single-quoted attributes, comments, and leaves full-value quoted interpolations (`datetime="${x}"`) and unquoted bindings (`value=${() => x}`) untouched.
- Streaming shells now fetch the concrete path (`/blog/:slug` → `/blog/hello-world`) instead of the route pattern.
- Client router now requests JSON (`{ title, body }`) from the render endpoint (titles update on SPA navigation), preserves query strings, and ignores modifier-key clicks.
- Island `data-props` serialization escapes single quotes, so props containing apostrophes hydrate correctly.
- Declaration files are emitted with explicit `.js` extensions, fixing type resolution for NodeNext consumers; the main entry no longer re-exports the CLI or the Vite plugin (use `@deijose/nix-js-kit/cli` / `@deijose/nix-js-kit/vite`), removing the CLI side-effect from adapter bundles.
- Adapters: the SSR entry now embeds the full route table (no runtime filesystem scanning), includes `layout.data.ts` modules in the registry, fixes action resolution by page scope, preserves the query string for page rendering, and serves the `/__nix-js/render` endpoint (HTML or JSON) so the SPA router and streaming keep working in production. Works with Node (`node:sqlite`) and Bun (`bun:sqlite`) runtimes.
- SSR page rendering now forwards the request query string as `searchParams` to loaders.
- Cookies are forwarded to API routes and server actions in every server mode, so auth/middleware that reads the session works in `start`, `preview`, `dev` and the Vite plugin.
- Server actions scoped to dynamic routes now work: the resolver maps concrete page paths (`/movies/inception`) to their route pattern (`/movies/:slug`) in `start`, `preview`, `dev`, the Vite plugin and all adapters.
- The client hydration bundle is now built through a wrapped Vite config that automatically injects the attribute-interpolation plugin, so partial interpolations inside islands (e.g. `href="/movies/${slug}"`) hydrate correctly instead of producing broken attributes.
- `preview` now renders the custom 404/500 error pages instead of plain-text responses.
- The `/__nix-js/render` endpoint returns a clean 404 (instead of a 500 with a stack trace) when the requested path has no matching route, in every server mode and in the adapters.
- Dev server (`nix-js-kit dev`) now runs the actual server in a child process supervised by a watcher: any source change restarts the worker, so page/loader/layout/island edits are always served (previously the ESM module cache served stale modules). Atomic saves (sed/editors) are detected via `rename` events.
- The dev supervisor exits on SIGTERM so stale processes cannot hold the port.

## 1.2.5

### Added

- `layout.data.ts` support: `renderPage` now resolves the nearest `layout.data.ts` loader for each `layout.ts` and passes the returned data to the layout component.
- Data loaders (page and layout) now receive the current `Request` object in their context, enabling SSR auth, cookies, and per-request headers.
- Streaming and SSR servers forward the request to both static and streaming render paths so loaders can read session cookies.

### Changed

- `LayoutProps` data is now populated from `layout.data.ts` when present; `PageProps` retains the `layoutData` slot for future nested layout support.

## 1.2.4

### Fixed

- Client router now re-hydrates islands after navigating to a new page. The generated client entry listens for the `nix-js:rendered` event and mounts islands over the swapped page body.
- Hydration no longer flashes the static markup: it renders the live island into a `DocumentFragment` and swaps the entire island content with `replaceChildren` in one DOM operation.
- Old island effects are disposed before the client router swaps `#app.innerHTML`, preventing leaked effects and stale DOM writes after SPA navigation.
- Vite interpolation plugin rewrites partial attribute interpolations (e.g. `href="/blog/${slug}"`) into a single interpolation in both `src/app` and `src/islands` files during the source transformation step.

## 1.2.3

### Fixed

- Dynamic API routes (`[slug]/route.ts`) now receive route parameters as a second argument (`{ params }`) in `nix-js-kit start`, `preview` and `dev`, matching the behavior already documented for API routes.

## 1.2.2

### Changed

- Server action registry serialized in the HTML shell now exposes only action names per page (`{"/contact":["subscribe"]}`), never file paths or implementation details.
- Client router is no longer inlined in every HTML page. It is bundled into the generated client entry (`/_nix-js/entry-client.js`) via `startClientRouter()` from `@deijose/nix-js-kit/router`, so routing code lives in the JS bundle like other frameworks.

## 1.2.1

### Fixed

- Server action file paths serialized in the HTML shell (`<script id="nix-js-actions">`) are now relative to the project root instead of absolute server paths. This prevents leaking the host file system layout (e.g. `/home/user/...`) in production HTML.

## 1.2.0

### Added

- Vite interpolation plugin transforms partial attribute interpolations (`href="/blog/${slug}"`) into single Nix.js interpolations automatically.
- Source transformation runs before build/dev/start/preview so authors can write natural `href` attributes without manual workarounds.
- Inline client-side router in the HTML shell: intercepts internal link clicks, fetches page body from `/__nix-js/render`, swaps `#app` and updates `history.pushState`.
- `preview` server falls back to on-demand SSR for routes that do not exist in the static `dist/` (e.g. dynamic slugs).
- Client hydration bundle is built automatically when a `vite.client.config.ts` exists.

## 1.1.1

### Added

- Streaming `loading.ts` boundaries: shell renders loading UI and client fetches real content from `/__nix-js/render`.
- `renderStreamingPage` and `renderPageBody` helpers exported.
- `streaming` option for `createSsrServer` (defaults to true when a page has `loading.ts`).

## 1.1.0

### Added

- ISR (Incremental Static Regeneration) with disk-based cache.
- `revalidate` export support in `page.data.ts`.
- `cacheDir` and `defaultRevalidate` options for `createSsrServer` and `nix-js-kit start`.
- Cache helpers exported: `getCachedHtml`, `setCachedHtml`, `clearCache`.
- `renderPage` now returns `{ html, revalidate? }`.

## 1.0.0

### Added

- Official v1.0 release. The framework is now stable with full test coverage.
- All v1.0 roadmap items completed: unit and integration tests, HMR, automatic `PageProps<typeof load>` typing, `nixJsAction`, scoped actions, progressive enhancement, `fail()`/`redirect()`, `route.ts` API endpoints, and `loading.ts` boundary scanning.

## 0.11.7

### Added

- `fail()` and `redirect()` helpers for server actions with client-side detection in `callAction`/`nixJsAction`.
- `route.ts` API endpoints supported in SSR server, Vite dev server, CLI preview/dev, and all adapters.
- `loading.ts` boundary scanned and included in the SSR module registry.
- `matchApiRoute` helper exported for dispatching API routes.
- Tests for `fail()`/`redirect()`, API routes, and loading boundaries.

## 0.11.6

### Added

- Integration test for the preview server (`doPreview`): serves static files and handles server actions.
- `doPreview` now returns the Node `http.Server` instance for easier programmatic control and testing.

## 0.11.5

### Added

- Integration tests for Vercel and Netlify adapters: build handlers and verify SSR responses.
- Integration test for Bun adapter: build server entry and verify it serves SSR with `bun run`.
- Cleanup hooks for Vercel/Netlify/Bun adapter tests.

## 0.11.4

### Added

- Integration tests for static build + SSR server.
- Node adapter integration test: builds `.nix-js/node-server.mjs` and verifies it serves SSR pages.
- Unit tests for `nixJsAction` helper (pending, data, and error signals).
- Cleanup hooks for integration tests to remove temporary `dist/` and `.nix-js/` folders.

## 0.11.3

### Added

- Initial test suite using Node's built-in test runner (`node:test`) and `tsx` for TypeScript imports.
- Tests for `scanRoutes`, `scanActions`, `handleActionRequest` (JSON and form), and `renderPage`.
- `test/fixtures/minimal` with sample pages, data loaders, actions, layout, and a dynamic route.
- `npm test` and `npm run test:watch` scripts.

## 0.11.2

### Added

- `PageProps<typeof load>` and `LayoutProps<typeof load>` now automatically infer the loader's return type (with `Awaited` for async functions).
- README quick example and dynamic route example use `PageProps<typeof load>`.
- Example home page uses `PageProps<typeof load>` instead of a manually exported interface.

## 0.11.1

### Added

- HMR for routes, actions, loaders, and islands in the Vite dev plugin.
- Vite dev plugin now resolves actions via `ssrLoadModule` so changed `page.action.ts` files are reloaded without a server restart.

## 0.11.0

### Added

- `nixJsAction` helper in `@deijose/nix-js-kit/action` with reactive `pending`, `error`, and `data` signals.
- Per-page action scoping: `scanActions` now returns `ActionRegistry` keyed by page URL path.
- `callAction` accepts an optional `{ page }` option to resolve actions scoped to a specific route.
- Progressive enhancement: `POST /__nix-js/actions` also accepts HTML form submissions and redirects back when `Accept: application/json` is missing.

### Changed

- Action registry serialized in `<script id="nix-js-actions">` is now grouped by page path.
- All action resolvers (SSR server, CLI dev/preview, Vite plugin, adapters) resolve by page first, then fall back to a global search.
- `callAction` signature updated to `callAction(name, args, options?)` where `args` can be a single value or an array.
- `callAction` now sends `Accept: application/json` so the server returns JSON instead of a redirect.
- SSR server, CLI dev/preview, and Vite plugin now forward `Content-Type`, `Accept`, and `Referer` headers to the action handler for correct JSON/form negotiation and redirects.
- README updated with `nixJsAction`, scoped actions, and progressive enhancement examples.

## 0.10.0

### Added

- Node adapter: `nix-js-kit adapter node` generates a self-contained `.nix-js/node-server.mjs` that serves `dist/` static files and renders pages on demand.
- New subpath export `@deijose/nix-js-kit/adapters/node`.
- Custom error pages: `src/app/404.page.ts` and `src/app/500.page.ts` are rendered for 404/500 responses during SSG, SSR, and in all deployment adapters.
- `renderErrorPage()` and `RenderErrorPageOptions` exported from `@deijose/nix-js-kit`.

### Changed

- CLI `adapter` command now accepts `vercel`, `netlify`, `bun`, and `node`.
- Route scanner detects `404.page.ts` and `500.page.ts` files and adds `error404`/`error500` to `ScannedRoutes`.
- Static build writes `dist/404.html` and `dist/500.html` when error pages are present.
- README updated with Node adapter and error pages sections.

## 0.9.0

### Added

- Server actions: create `page.action.ts` files next to `page.ts` and call exported functions from the client with `callAction()`.
- New client subpath export `@deijose/nix-js-kit/action` exporting `callAction()` and `ActionRequest`.
- Server-side action endpoint `POST /__nix-js/actions` handled by the CLI (`dev`, `preview`, `start`), the Vite plugin, and all deployment adapters (Vercel, Netlify, Bun).
- New server exports `handleActionRequest`, `ActionResolver` and `scanActions` for custom integrations.
- Document shell now serializes the scanned action registry into `<script id="nix-js-actions">` for client reference.
- Island hydration markers renamed from `data-nix-island` to `data-nix-js-island`.

### Changed

- Route scanner detects `page.action.ts` files and adds `actionPath` to `PageRoute`.
- README updated with a Server actions section and project conventions tree.

## 0.8.1

### Added

- Bun adapter: `nix-js-kit adapter bun` generates `.nix-js/bun-server.ts` and `.nix-js/bun-index.ts` for running a production Bun server.
- New subpath export `@deijose/nix-js-kit/adapters/bun`.

### Changed

- CLI `adapter` command now accepts `vercel`, `netlify` and `bun`.
- README updated with Bun adapter instructions and roadmap v0.9.

## 0.8.0

### Added

- Netlify adapter: `nix-js-kit adapter netlify` generates a Netlify Functions v2 SSR function and `netlify.toml`.
- New subpath export `@deijose/nix-js-kit/adapters/netlify`.
- Shared adapter helpers in `src/adapters/shared.ts` used by both Vercel and Netlify adapters.

### Changed

- CLI `adapter` command now accepts `vercel` and `netlify`.
- README updated with Netlify adapter instructions and roadmap v0.8.

## 0.7.0

### Added

- Vercel adapter: `nix-js-kit adapter vercel` generates a `.vercel/output` directory compatible with the Vercel Build Output API v3.
- New adapter interface in `src/adapters/index.ts`.
- New CLI command `nix-js-kit adapter <name>` (currently supports `vercel`).
- New subpath exports `@deijose/nix-js-kit/adapters` and `@deijose/nix-js-kit/adapters/vercel`.

### Changed

- README updated with adapters section, CLI command list and roadmap v0.7/v0.8.

## 0.6.1

### Changed

- Renamed Vite plugin function from `nixKit` to `nixJsKit` and the options interface from `NixKitViteOptions` to `NixJsKitViteOptions` to keep the `js` word in the public API.
- Updated README, CHANGELOG and example import to use `nixJsKit`.

## 0.6.0

### Added

- Official Vite plugin: `import { nixJsKit } from "@deijose/nix-js-kit/vite"`.
- Vite plugin generates the islands entry automatically and renders pages via SSR on the Vite dev server.
- New subpath export `@deijose/nix-js-kit/vite` for plugin usage.
- Added `example/vite.config.ts` demonstrating the Vite plugin.

### Changed

- README updated with Vite plugin section and roadmap v0.6/v0.7.

## 0.5.0

### Added

- SSR runtime: `nix-js-kit start` renders pages on demand and serves static assets from `dist/`.
- `matchRoute` URL matcher for dynamic and catch-all routes.
- `renderPage` shared renderer used by both SSG and SSR.
- `createSsrServer` exported from the public API for custom Node deployments.

### Changed

- `src/build/build.ts` now uses the shared `renderPage` from `src/ssr/render.ts`.
- CLI help text and README updated to include the `start` command.

## 0.4.2

### Added

- Route groups `(marketing)` support: folders wrapped in parentheses are ignored in the URL path but can provide a shared `layout.ts`.
- Added `example/src/app/(marketing)/` with `pricing` and `features` pages demonstrating route groups.

### Fixed

- Route scanner now reads `layout.ts` from inside the route group directory instead of the parent directory.

## 0.4.1

### Added

- `nix-js-kit preview` command to serve the static build in production mode.
- Clean URL support for static files (e.g. `/about` → `/about/index.html`).

### Changed

- CLI help text and README updated to include the `preview` command.

## 0.4.0

### Added

- `generateStaticParams` export for dynamic routes (`[slug]`) and catch-all routes (`[...slug]`).
- Dynamic routes with `generateStaticParams` are now rendered to static HTML during SSG instead of being skipped.
- `GenerateStaticParams` type exported from the public API.
- Added `example/src/app/blog/[slug]` demonstrating a generated blog post route.

### Changed

- Updated `tsconfig.json` with `paths` mapping so examples can import from `@deijose/nix-js-kit` during development and typechecking.

## 0.3.1

### Changed

- Renamed CLI binary from `nix-kit` to `nix-js-kit` to avoid confusion with the Nix package manager.
- Updated runtime warning prefix from `[nix-kit]` to `[nix-js-kit]`.

## 0.3.0

### Added

- `nix-js-kit` CLI binary with `build` and `dev` commands.
- Dev server (`nix-js-kit dev`) with rebuild-on-change for `src/app/` and `src/islands/`.
- `--client-config` option to rebuild the client hydration bundle on each source change.
- `run()` and `CliOptions` exported from `@deijose/nix-js-kit` for programmatic CLI usage.

### Changed

- `build:lib` now produces a separate SSR build for `dist/lib/cli.js` so the CLI can import user `.ts` files at runtime.
- Added `tsx` as a runtime dependency so the CLI can load user pages and islands without extra setup.

## 0.2.2

### Added

- `scanIslands()` — recursively scans an islands directory; each `.ts` file becomes an island named by its relative path.
- `generateClientEntry()` / `buildEntrySource()` — generates the client hydration entry from scanned islands.
- `build()` now accepts `islandsDir`, `generatedEntry`, and `hydrateImport`; `BuildResult` reports `islands` and `generatedEntry`.
- Second example island (`Counter`) demonstrating multiple islands and the `visible` directive.

## 0.2.1

### Added

- `island()` helper — marks interactive components with `data-nix-island` markers during SSG.
- `hydrateIslands()` — client-side hydration registry with `load`, `idle`, and `visible` directives.
- `example/src/islands/` + `example/src/entry-client.ts` demonstrating a `LikeButton` island.
- `./island` subpath export so client bundles don't pull server-only code.

## 0.2.0

### Added

- `scanRoutes` — file-based route scanner that maps `src/app/page.ts` to URL paths, including dynamic segments (`[slug]`, `[...slug]`).
- `build` — SSG orchestrator that scans `src/app/`, runs loaders, composes layout chains, renders pages, and writes static HTML.
- Example app with two pages (`/`, `/about`) sharing a root layout.

## 0.1.0

### Added

- Initial release of `@deijose/nix-js-kit`.
- `renderToString` for Nix.js templates using `happy-dom` as a build-time DOM (client bundle remains dependency-free).
- `documentShell` helper to wrap rendered HTML with a full document shell and serialize loader data via `<script id="nix-js-data">`.
- Public types: `PageProps`, `LayoutProps`, `PageDataLoad`, `LoadContext`, `RouteParams`, `ShellOptions`.
- Proof-of-concept example under `example/` that generates `dist/index.html` from a `page.ts` + `page.data.ts` pair.
- Vite library build configuration and TypeScript declaration generation.

### Notes

- `linkedom` was evaluated as a lighter DOM alternative but rejected because it does not expose `NodeFilter` in a way compatible with the Nix.js core (`template2.js` reads `NodeFilter.SHOW_ELEMENT` from `globalThis`).
