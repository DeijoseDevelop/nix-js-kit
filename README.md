# Nix Kit

[![npm version](https://img.shields.io/npm/v/@deijose/nix-js-kit.svg)](https://www.npmjs.com/package/@deijose/nix-js-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> Full-stack meta-framework for Nix.js — file-based routing, SSG, and islands. Zero extra runtime dependencies on the client: Nix.js stays at ~14KB.

## What is Nix Kit?

Nix Kit is a meta-framework built on top of [Nix.js](https://nix-js.dev/). It brings conventions similar to Next.js App Router to Nix.js:

- `src/app/page.ts` for pages
- `src/app/page.data.ts` for loaders
- `src/app/page.action.ts` for server actions
- `src/app/layout.ts` for layouts
- `src/app/route.ts` for API endpoints

The key difference is the runtime cost: Nix.js has no virtual DOM, so islands hydrate individual signals instead of full component trees. The result is a much smaller client bundle.

## Installation

```bash
npm install @deijose/nix-js @deijose/nix-js-kit
# or
bun add @deijose/nix-js @deijose/nix-js-kit
```

## Quick example

```ts
// src/app/page.data.ts
import type { PageDataLoad } from "@deijose/nix-js-kit";

export const load: PageDataLoad = async () => {
  return { title: "Hello Nix Kit" };
};
```

```ts
// src/app/page.ts
import { html, signal } from "@deijose/nix-js";
import type { PageProps } from "@deijose/nix-js-kit";

export default function HomePage({ data }: PageProps<{ title: string }>) {
  const liked = signal(false);

  return html`
    <article>
      <h1>${data.title}</h1>
      <button @click=${() => (liked.value = !liked.value)}>
        ${() => (liked.value ? "★ Liked" : "☆ Like")}
      </button>
    </article>
  `;
}
```

At build time, `nix-js-kit` runs the loader and renders the page to static HTML using `renderToString`.

## CLI

After installing, the `nix-js-kit` binary is available in your project:

```bash
nix-js-kit build
nix-js-kit dev
```

By default it looks for `src/app/` and `src/islands/` and writes to `dist/`:

```bash
nix-js-kit build
# → dist/index.html
# → dist/_nix-js/entry-client.js   (after bundling the generated entry)
```

Run the dev server with rebuild-on-change:

```bash
nix-js-kit dev --client-config vite.client.config.ts
```

Options:

| Flag | Default | Description |
| --- | --- | --- |
| `-r, --root <dir>` | `cwd` | Project root |
| `-a, --app <dir>` | `src/app` | Pages directory relative to root |
| `-i, --islands <dir>` | `src/islands` | Islands directory relative to root |
| `-o, --out <dir>` | `dist` | Output directory relative to root |
| `-p, --port <number>` | `3000` | Dev server port |
| `-h, --host <address>` | `127.0.0.1` | Dev server host |
| `-l, --lang <lang>` | `es` | HTML `lang` attribute |
| `--hydrate-import <spec>` | `@deijose/nix-js-kit/island` | Import path for `hydrateIslands` in generated entry |
| `--client-config <path>` | — | Vite config used to build the client bundle in dev mode |

## Core features (v0.3)

- **Static site generation (SSG)** from `src/app/` file conventions.
- **File-based route scanner** — maps `page.ts` files to URLs.
- **Layout chain** — nested `layout.ts` files wrap pages automatically.
- **`renderToString` for Nix.js templates** without touching the Nix.js core.
- **Happy DOM** as a build-time dependency only — the Nix.js client bundle stays dependency-free.
- **Islands** via `island()` helper — mark interactive components and hydrate them on the client with `hydrateIslands`.
- **Auto island scan** — `build()` scans `src/islands/` and generates the client hydration entry for you.
- **Document shell** with serialized loader data (`<script id="nix-data">`).
- **CLI** (`nix-kit build` / `nix-kit dev`) with dev server and rebuild-on-change.

## Roadmap

| Version | Focus |
| --- | --- |
| v0.1 | SSG + file-based routing |
| v0.2 | Islands, data loading, actions, API routes |
| v0.3 | CLI + dev server |
| v0.4 | SSR runtime + adapters |
| v0.5 | Generators, type-safe `PageProps` |

See the full architecture proposal in `docs/nix-js-kit-propuesta-implementacion.md`.

## API

### `renderToString(factory)`

Renders a Nix.js template to an HTML string in Node.js.

```ts
import { renderToString } from "@deijose/nix-js-kit";
import HomePage from "./src/app/page";

const body = await renderToString(() => HomePage({ data: { title: "Hi" } }));
```

### `documentShell(options)`

Wraps rendered HTML in a full document shell with `<script id="nix-data">`.

```ts
import { documentShell } from "@deijose/nix-js-kit";

const html = documentShell({
  title: "My Page",
  body,
  data: { title: "My Page" },
  clientEntry: "/_nix-js/entry-client.js",
});
```

### Islands

Create an interactive component in `src/islands/`:

```ts
// src/islands/LikeButton.ts
import { html, signal } from "@deijose/nix-js";

export default function LikeButton({ postId }: { postId: string }) {
  const liked = signal(false);
  return html`
    <button @click=${() => (liked.value = !liked.value)}>
      ${() => (liked.value ? "★ Liked" : "☆ Like")}
    </button>
  `;
}
```

Mark it as an island in a page:

```ts
// src/app/page.ts
import { html, island } from "@deijose/nix-js-kit";
import LikeButton from "../islands/LikeButton";

export default function HomePage() {
  return html`
    <article>
      <h1>Hello</h1>
      ${island("LikeButton", LikeButton, { postId: "123" }, "load")}
    </article>
  `;
}
```

Hydrate it on the client. You can write the entry by hand:

```ts
// src/entry-client.ts
import { hydrateIslands } from "@deijose/nix-js-kit/island";
import LikeButton from "./islands/LikeButton";

hydrateIslands({ LikeButton });
```

…or let `build()` generate it for you by scanning `src/islands/` (see
[Auto island scan](#auto-island-scan) below). Each `.ts` file becomes an island
whose registry name is its path relative to `islandsDir`
(`nav/MobileMenu.ts` → `"nav/MobileMenu"`).

Directives:

| Directive | Hydration trigger |
| --- | --- |
| `load` | Immediately |
| `idle` | `requestIdleCallback` |
| `visible` | `IntersectionObserver` |

### `build(config)`

Scans `src/app/` and generates the full static site in `dist/`. You can call it
from code or use the `nix-js-kit build` CLI (see [CLI](#cli)).

```ts
import { build } from "@deijose/nix-js-kit";

await build({
  appDir: "./src/app",
  outDir: "./dist",
  clientEntry: "/_nix-js/entry-client.js",
  // Optional: auto-generate the hydration entry from src/islands/
  islandsDir: "./src/islands",
  generatedEntry: "./.nix-js/entry-client.ts",
});
```

The scanner recognizes:

| File | URL | Notes |
| --- | --- | --- |
| `src/app/page.ts` | `/` | Home page |
| `src/app/about/page.ts` | `/about` | Static page |
| `src/app/blog/[slug]/page.ts` | `/blog/:slug` | Dynamic route (needs `generateStaticParams` in v0.2) |
| `src/app/[...slug]/page.ts` | `/:slug*` | Catch-all route |
| `src/app/layout.ts` | all children | Root layout |
| `src/app/blog/layout.ts` | `/blog/*` | Nested layout |

### Auto island scan

When you pass `islandsDir` and `generatedEntry`, `build()` walks the islands
directory and writes a client entry that imports every island and registers it
with `hydrateIslands`. Point your bundler (Vite/Rollup) at the generated file:

```ts
await build({
  appDir: "./src/app",
  outDir: "./dist",
  clientEntry: "/_nix-js/entry-client.js",
  islandsDir: "./src/islands",
  generatedEntry: "./.nix-js/entry-client.ts",
});
```

Given `src/islands/LikeButton.ts` and `src/islands/nav/MobileMenu.ts`, the
generated `.nix-js/entry-client.ts` looks like:

```ts
// AUTO-GENERATED by @deijose/nix-js-kit. Do not edit.
import { hydrateIslands } from "@deijose/nix-js-kit/island";
import LikeButton_0 from "../src/islands/LikeButton";
import MobileMenu_1 from "../src/islands/nav/MobileMenu";

hydrateIslands({
  "LikeButton": LikeButton_0,
  "nav/MobileMenu": MobileMenu_1,
});
```

The `build()` result also reports the discovered islands:

```ts
const result = await build({ /* ... */ });
result.islands;        // [{ name: "LikeButton", filePath: "…" }, …]
result.generatedEntry; // absolute path to the generated entry
```

You can also call the lower-level helpers directly:

```ts
import { scanIslands, generateClientEntry } from "@deijose/nix-js-kit";

const islands = await scanIslands("./src/islands");
await generateClientEntry({ islands, outFile: "./.nix-js/entry-client.ts" });
```

## Project conventions

```text
my-app/
├── src/
│   └── app/
│       ├── layout.ts        # root layout
│       ├── page.ts          # home page
│       ├── page.data.ts     # home loader
│       ├── blog/
│       │   ├── page.ts
│       │   └── page.data.ts
│       └── api/
│           └── posts/
│               └── route.ts # API endpoint
├── nix.config.ts
└── vite.config.ts
```

## License

MIT © Deiver Vasquez
