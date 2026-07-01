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

At build time, `nix-kit` runs the loader and renders the page to static HTML using `renderToString`.

## Core features (v0.1)

- **Static site generation (SSG)** from `src/app/` file conventions.
- **File-based route scanner** — maps `page.ts` files to URLs.
- **Layout chain** — nested `layout.ts` files wrap pages automatically.
- **`renderToString` for Nix.js templates** without touching the Nix.js core.
- **Happy DOM** as a build-time dependency only — the Nix.js client bundle stays dependency-free.
- **Document shell** with serialized loader data (`<script id="nix-data">`).

## Roadmap

| Version | Focus |
| --- | --- |
| v0.1 | SSG + file-based routing + dev server |
| v0.2 | Islands (`client:`), data loading, actions, API routes |
| v0.3 | SSR runtime + adapters |
| v0.4 | CLI, generators, type-safe `PageProps` |

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
  clientEntry: "/_nix/entry-client.js",
});
```

### `build(config)`

Scans `src/app/` and generates the full static site in `dist/`.

```ts
import { build } from "@deijose/nix-js-kit";

await build({
  appDir: "./src/app",
  outDir: "./dist",
  clientEntry: "/_nix/entry-client.js",
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
