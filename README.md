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
nix-js-kit preview
nix-js-kit start
nix-js-kit adapter vercel
nix-js-kit adapter netlify
nix-js-kit adapter bun
nix-js-kit adapter node
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

Serve the production build:

```bash
nix-js-kit build
nix-js-kit preview
```

Run the SSR server (renders pages on demand):

```bash
nix-js-kit build          # generate or update the client bundle
nix-js-kit start
```

Options:

| Flag | Default | Description |
| --- | --- | --- |
| `-r, --root <dir>` | `cwd` | Project root |
| `-a, --app <dir>` | `src/app` | Pages directory relative to root |
| `-i, --islands <dir>` | `src/islands` | Islands directory relative to root |
| `-o, --out <dir>` | `dist` | Output directory relative to root |
| `-p, --port <number>` | `3000` | Server port |
| `-h, --host <address>` | `127.0.0.1` | Server host |
| `-l, --lang <lang>` | `es` | HTML `lang` attribute |
| `--hydrate-import <spec>` | `@deijose/nix-js-kit/island` | Import path for `hydrateIslands` in generated entry |
| `--client-config <path>` | — | Vite config used to build the client bundle in dev mode |

## Core features (v0.7)

- **Static site generation (SSG)** from `src/app/` file conventions.
- **File-based route scanner** — maps `page.ts` files to URLs.
- **Dynamic routes** with `generateStaticParams` — generate static HTML for `[slug]` and `[...slug]` routes.
- **Route groups** `(marketing)` — shared layouts without affecting the URL path.
- **Layout chain** — nested `layout.ts` files wrap pages automatically.
- **SSR runtime** — `nix-js-kit start` renders pages on demand and serves static assets.
- **Vite plugin** — `nixJsKit()` gives a Vite-native dev server with SSR and island entry generation.
- **Vercel adapter** — `nix-js-kit adapter vercel` generates `.vercel/output` with static files and an SSR fallback function.
- **Netlify adapter** — `nix-js-kit adapter netlify` generates a Netlify Functions v2 SSR function and `netlify.toml`.
- **Bun adapter** — `nix-js-kit adapter bun` generates a Bun server entry that serves static files and renders pages on demand.
- **Node adapter** — `nix-js-kit adapter node` generates a self-contained Node server.
- **Custom error pages** — `src/app/404.page.ts` and `src/app/500.page.ts` are rendered for 404/500 responses in SSG, SSR, and all adapters.
- **Server actions** — define `page.action.ts` files next to `page.ts` and call them from the client with `nixAction()` or `callAction()`.
- **Scoped actions** — actions are registered per page path, so names only collide if they are in the same route.
- **Progressive enhancement** — actions work from plain HTML forms without JavaScript.
- **`renderToString` for Nix.js templates** without touching the Nix.js core.
- **Happy DOM** as a build-time dependency only — the Nix.js client bundle stays dependency-free.
- **Islands** via `island()` helper — mark interactive components and hydrate them on the client with `hydrateIslands`.
- **Auto island scan** — `build()` scans `src/islands/` and generates the client hydration entry for you.
- **Document shell** with serialized loader data (`<script id="nix-js-data">`).
- **CLI** (`nix-js-kit build` / `nix-js-kit dev` / `nix-js-kit preview` / `nix-js-kit start`).

## Roadmap

| Version | Focus |
| --- | --- |
| v0.1 | SSG + file-based routing |
| v0.2 | Islands, data loading, actions, API routes |
| v0.3 | CLI + dev server |
| v0.4 | `generateStaticParams`, route groups, preview server |
| v0.5 | SSR runtime + adapter-node |
| v0.6 | Vite plugin + DX improvements |
| v0.7 | Vercel adapter + DX improvements |
| v0.8 | Netlify adapter + Bun adapter |
| v0.9 | Server actions ✅ |
| v1.0 | Stabilization: test suite, error handling ✅, Node adapter ✅, and action DX ✅ |

## API

### `renderToString(factory)`

Renders a Nix.js template to an HTML string in Node.js.

```ts
import { renderToString } from "@deijose/nix-js-kit";
import HomePage from "./src/app/page";

const body = await renderToString(() => HomePage({ data: { title: "Hi" } }));
```

### `documentShell(options)`

Wraps rendered HTML in a full document shell with `<script id="nix-js-data">`.

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
| `src/app/blog/[slug]/page.ts` | `/blog/:slug` | Dynamic route (requires `generateStaticParams`) |
| `src/app/[...slug]/page.ts` | `/:slug*` | Catch-all route (requires `generateStaticParams`) |
| `src/app/(marketing)/about/page.ts` | `/about` | Route group (ignored in URL, can add layout) |
| `src/app/layout.ts` | all children | Root layout |
| `src/app/blog/layout.ts` | `/blog/*` | Nested layout |
| `src/app/(marketing)/layout.ts` | `/pricing`, `/features` | Group layout |
| `src/app/404.page.ts` | error | Custom 404 page (SSG, SSR, adapters) |
| `src/app/500.page.ts` | error | Custom 500 page (SSG, SSR, adapters) |

### Dynamic routes with `generateStaticParams`

Dynamic routes are skipped during SSG unless the page exports a
`generateStaticParams` function. It returns an array of param objects, one per
static HTML file to generate:

```ts
// src/app/blog/[slug]/page.ts
import { html } from "@deijose/nix-js";
import type { PageProps, GenerateStaticParams } from "@deijose/nix-js-kit";

export const generateStaticParams: GenerateStaticParams = async () => {
  return [{ slug: "hello-world" }, { slug: "nix-js-kit" }];
};

export default function BlogPostPage({ data, params }: PageProps) {
  return html`
    <article>
      <h1>${data.title}</h1>
      <p>Slug: ${params.slug}</p>
    </article>
  `;
}
```

```ts
// src/app/blog/[slug]/page.data.ts
import type { PageDataLoad } from "@deijose/nix-js-kit";

export const load: PageDataLoad = async ({ params }) => {
  return { title: `Post: ${params.slug}` };
};
```

Running `nix-js-kit build` then produces:

```
dist/blog/hello-world/index.html
dist/blog/nix-js-kit/index.html
```

Catch-all routes use a string array for the spread param:

```ts
export const generateStaticParams = async () => {
  return [{ slug: ["docs", "intro"] }]; // -> /docs/intro
};
```

### Server actions

Create a `page.action.ts` file next to a `page.ts` and export async functions.
They run on the server and can be called from the client with `callAction()` or
`nixAction()`:

```ts
// src/app/contact/page.action.ts
export async function submitContact(data: { name: string; email: string }) {
  // validate, write to DB, send email, etc.
  return { ok: true };
}
```

```ts
// src/app/contact/page.ts or any island
import { nixAction } from "@deijose/nix-js-kit/action";

const contact = nixAction("submitContact", { page: "/contact" });

// inside a template
html`
  <form @submit=${(e: Event) => {
    e.preventDefault();
    contact.submit({ name: "Ada", email: "ada@example.com" });
  }}>
    <input name="name" />
    <input name="email" />
    <button type="submit" disabled=${() => contact.pending.value}>
      ${() => (contact.pending.value ? "Sending..." : "Send")}
    </button>
  </form>
  ${() => contact.error.value ? html`<p>${contact.error.value.message}</p>` : null}
  ${() => contact.data.value ? html`<p>Sent!</p>` : null}
`
```

`nixAction` returns a reactive handle with:

- `submit(input)` — calls the action and updates the signals.
- `pending` — signal that is `true` while the action is running.
- `error` — signal with the last error, or `null`.
- `data` — signal with the last successful result, or `null`.

The `page` option scopes the action to a specific route, avoiding name
collisions between different `page.action.ts` files. If you omit it, the
framework falls back to searching all scanned actions by name.

For lower-level control, use `callAction` directly:

```ts
import { callAction } from "@deijose/nix-js-kit/action";

const result = await callAction("submitContact", { name: "Ada", email: "ada@example.com" }, { page: "/contact" });
```

#### Progressive enhancement

Actions also work without JavaScript. Add hidden fields to a plain HTML form
and POST to `/__nix-js/actions`:

```html
<form action="/__nix-js/actions" method="POST">
  <input type="hidden" name="__nix_action_name" value="submitContact" />
  <input type="hidden" name="__nix_action_page" value="/contact" />
  <input name="name" />
  <input name="email" />
  <button type="submit">Send</button>
</form>
```

The server runs the action and redirects back to the referring page (or to the
string returned by the action). If the client sends `Accept: application/json`,
the result is returned as JSON instead.

The framework exposes the `POST /__nix-js/actions` endpoint in every server mode
(`dev`, `preview`, `start` and all deployment adapters). The action name is
resolved against the scanned `page.action.ts` modules and its return value is
serialized as JSON.

### Route groups

Folders whose name is wrapped in parentheses are ignored in the URL but can
hold a `layout.ts` that applies to all their children:

```
src/app/
├── (marketing)/
│   ├── layout.ts
│   ├── pricing/
│   │   └── page.ts   # -> /pricing
│   └── features/
│       └── page.ts   # -> /features
```

This is useful for shared layouts that don't affect the public path, such as a
marketing shell that differs from a dashboard shell.

### Error pages

Create optional `src/app/404.page.ts` and `src/app/500.page.ts` files to customize
the response when a route is missing or when a page fails to render:

```ts
// src/app/404.page.ts
import { html } from "@deijose/nix-js";

export default function NotFoundPage() {
  return html`
    <article>
      <h1>404</h1>
      <p>Page not found.</p>
      <a href="/">Back home</a>
    </article>
  `;
}
```

```ts
// src/app/500.page.ts
import { html } from "@deijose/nix-js";

export default function ErrorPage() {
  return html`
    <article>
      <h1>500</h1>
      <p>Something went wrong.</p>
      <a href="/">Back home</a>
    </article>
  `;
}
```

The framework renders these pages:

- During `nix-js-kit build` as `dist/404.html` and `dist/500.html`.
- During `nix-js-kit start` and in the Vite plugin for unmatched routes and render errors.
- In every deployment adapter (`vercel`, `netlify`, `bun`, `node`) for unmatched routes and SSR render failures.

Error pages receive the same `PageProps` as regular pages and can export their own `404.page.data.ts` or `500.page.data.ts` loaders.

### SSR runtime

`nix-js-kit start` runs a Node HTTP server that renders pages on demand,
matching the request URL against the scanned routes and running loaders with
params and search params. Static files are served from the output directory
first, so the client bundle and other assets keep working:

```bash
nix-js-kit build          # build the client bundle and any static files
nix-js-kit start          # SSR server on http://127.0.0.1:3000
```

You can also use the lower-level API to embed the SSR server in a custom Node
app:

```ts
import { createSsrServer } from "@deijose/nix-js-kit";

const ssr = await createSsrServer({
  appDir: "./src/app",
  publicDir: "./dist",
  clientEntry: "/_nix-js/entry-client.js",
  port: 3000,
});
await ssr.listen();
```

### Vite plugin

The official Vite plugin gives you a Vite-native dev server with SSR rendering
and automatic island entry generation:

```ts
import { defineConfig } from "vite";
import { nixJsKit } from "@deijose/nix-js-kit/vite";

export default defineConfig({
  plugins: [nixJsKit()],
});
```

Then run the Vite dev server:

```bash
npx vite
```

The plugin scans `src/app/`, writes `.nix-js/entry-client.ts` and renders every
page on demand. For production, keep using `nix-js-kit build` to generate static
HTML and the client bundle.

### Adapters

Deploy to Vercel with the built-in adapter. First build the site, then generate
the Vercel output:

```bash
nix-js-kit build
nix-js-kit adapter vercel
```

This produces a `.vercel/output` directory that includes:

- `static/` — the static files from `dist/`.
- `functions/__nix-js-kit.func/index.js` — a bundled SSR function for unmatched routes.
- `config.json` — Vercel Build Output API v3 routing config.

You can also use the adapter programmatically:

```ts
import { vercelAdapter } from "@deijose/nix-js-kit/adapters/vercel";

await vercelAdapter.build({
  root: process.cwd(),
  appDir: "src/app",
  islandsDir: "src/islands",
  outDir: "dist",
  clientEntry: "/_nix-js/entry-client.js",
  lang: "es",
});
```

### Netlify adapter

Deploy to Netlify with the built-in adapter:

```bash
nix-js-kit build
nix-js-kit adapter netlify
```

This produces:

- `netlify/functions/__nix-js-kit.mjs` — bundled SSR function for Netlify Functions v2.
- `netlify.toml` — redirects unmatched routes to the function.

The static files stay in `dist/` and are served directly by Netlify. Programmatic usage:

```ts
import { netlifyAdapter } from "@deijose/nix-js-kit/adapters/netlify";

await netlifyAdapter.build({
  root: process.cwd(),
  appDir: "src/app",
  islandsDir: "src/islands",
  outDir: "dist",
  clientEntry: "/_nix-js/entry-client.js",
  lang: "es",
});
```

### Bun adapter

Run a production server with Bun:

```bash
nix-js-kit build
nix-js-kit adapter bun
bun run .nix-js/bun-server.ts
```

This generates:

- `.nix-js/bun-index.ts` — SSR handler entry.
- `.nix-js/bun-server.ts` — Bun server that serves `dist/` static files and renders pages on demand.

The server respects the `PORT` environment variable (default `3000`). Programmatic usage:

```ts
import { bunAdapter } from "@deijose/nix-js-kit/adapters/bun";

await bunAdapter.build({
  root: process.cwd(),
  appDir: "src/app",
  islandsDir: "src/islands",
  outDir: "dist",
  clientEntry: "/_nix-js/entry-client.js",
  lang: "es",
});
```

### Node adapter

Run a production server with Node (v18+):

```bash
nix-js-kit build
nix-js-kit adapter node
node .nix-js/node-server.mjs
```

This generates a single bundled `.nix-js/node-server.mjs` that serves `dist/` static files and renders pages on demand. The server respects the `PORT` environment variable (default `3000`). Programmatic usage:

```ts
import { nodeAdapter } from "@deijose/nix-js-kit/adapters/node";

await nodeAdapter.build({
  root: process.cwd(),
  appDir: "src/app",
  islandsDir: "src/islands",
  outDir: "dist",
  clientEntry: "/_nix-js/entry-client.js",
  lang: "es",
});
```

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
│       ├── page.action.ts   # home server actions
│       ├── 404.page.ts      # custom 404 page
│       ├── 500.page.ts      # custom 500 page
│       ├── blog/
│       │   ├── page.ts
│       │   ├── page.data.ts
│       │   └── page.action.ts
│       └── api/
│           └── posts/
│               └── route.ts # API endpoint
├── nix.config.ts
└── vite.config.ts
```

## License

MIT © Deiver Vasquez
