# Changelog

All notable changes to `@deijose/nix-js-kit` will be documented in this file.

## 0.11.0

### Added

- `nixAction` helper in `@deijose/nix-js-kit/action` with reactive `pending`, `error`, and `data` signals.
- Per-page action scoping: `scanActions` now returns `ActionRegistry` keyed by page URL path.
- `callAction` accepts an optional `{ page }` option to resolve actions scoped to a specific route.
- Progressive enhancement: `POST /__nix-js/actions` also accepts HTML form submissions and redirects back when `Accept: application/json` is missing.

### Changed

- Action registry serialized in `<script id="nix-js-actions">` is now grouped by page path.
- All action resolvers (SSR server, CLI dev/preview, Vite plugin, adapters) resolve by page first, then fall back to a global search.
- `callAction` signature updated to `callAction(name, args, options?)` where `args` can be a single value or an array.
- `callAction` now sends `Accept: application/json` so the server returns JSON instead of a redirect.
- SSR server, CLI dev/preview, and Vite plugin now forward `Content-Type`, `Accept`, and `Referer` headers to the action handler for correct JSON/form negotiation and redirects.
- README updated with `nixAction`, scoped actions, and progressive enhancement examples.

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
