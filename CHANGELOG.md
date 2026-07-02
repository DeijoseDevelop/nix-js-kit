# Changelog

All notable changes to `@deijose/nix-js-kit` will be documented in this file.

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
- `documentShell` helper to wrap rendered HTML with a full document shell and serialize loader data via `<script id="nix-data">`.
- Public types: `PageProps`, `LayoutProps`, `PageDataLoad`, `LoadContext`, `RouteParams`, `ShellOptions`.
- Proof-of-concept example under `example/` that generates `dist/index.html` from a `page.ts` + `page.data.ts` pair.
- Vite library build configuration and TypeScript declaration generation.

### Notes

- `linkedom` was evaluated as a lighter DOM alternative but rejected because it does not expose `NodeFilter` in a way compatible with the Nix.js core (`template2.js` reads `NodeFilter.SHOW_ELEMENT` from `globalThis`).
