import type { NixTemplate } from "@deijose/nix-js";
import { renderToString } from "../render/render-to-string";
import { documentShell } from "../build/document-shell";
import type { PageRoute, ScannedRoutes } from "../router/route-scanner";
import type { BuildConfig } from "../build/build";
import type { ActionRegistry } from "../action/scan";
import { matchRoute } from "./match";
import { renderPage } from "./render";

export interface StreamingPageOptions {
  route: PageRoute;
  params: Record<string, string | string[]>;
  searchParams: URLSearchParams;
  config: Pick<BuildConfig, "lang" | "clientEntry">;
  importer?: (path: string) => Promise<unknown>;
  actions?: ActionRegistry;
}

const defaultImport = (path: string) => import(path);

function streamingScript(page: string, search: string): string {
  const src = `
    async function __nixJsStreamRender() {
      try {
        const url = "/__nix-js/render?page=" + encodeURIComponent(${JSON.stringify(page)}) + "&search=" + encodeURIComponent(${JSON.stringify(search)});
        const res = await fetch(url);
        if (!res.ok) throw new Error("Streaming render failed: " + res.status);
        const html = await res.text();
        const app = document.getElementById("app");
        if (app) app.innerHTML = html;
        document.dispatchEvent(new CustomEvent("nix-js:rendered"));
      } catch (err) {
        console.error("[nix-js-kit] streaming render failed", err);
      }
    }
    __nixJsStreamRender();
  `;
  return `<script type="module">${src}</script>`;
}

/**
 * Render a page shell that shows the loading boundary while the real content
 * is fetched and injected by the client.
 */
export async function renderStreamingPage(options: StreamingPageOptions): Promise<string> {
  const { route, searchParams, config, importer = defaultImport, actions } = options;
  if (!route.loadingPath) {
    throw new Error("Cannot stream a page without a loading.ts boundary");
  }

  const { default: Loading } = (await importer(route.loadingPath)) as {
    default: () => NixTemplate;
  };

  const loadingBody = await renderToString(() => Loading());
  const body = `<div id="nix-js-loading">${loadingBody}</div>${streamingScript(route.path, searchParams.toString())}`;

  return documentShell({
    title: "Loading...",
    lang: config.lang,
    body,
    data: { __nix_js_streaming: true, page: route.path },
    actions,
    clientEntry: config.clientEntry,
  });
}

export interface RenderPageBodyOptions {
  routes: ScannedRoutes;
  pathname: string;
  searchParams: URLSearchParams;
  config: Pick<BuildConfig, "lang" | "clientEntry">;
  actions?: ActionRegistry;
  importer?: (path: string) => Promise<unknown>;
}

/**
 * Render only the inner HTML body for a page. Used by the streaming endpoint
 * to inject the real content into the shell.
 */
export async function renderPageBody(options: RenderPageBodyOptions): Promise<string> {
  const { routes, pathname, searchParams, config, actions, importer = defaultImport } = options;
  const match = matchRoute(pathname, routes.pages);
  if (!match) {
    throw new Error(`No route found for ${pathname}`);
  }

  const result = await renderPage({
    route: match.route,
    params: match.params,
    searchParams,
    config,
    actions,
    importer,
  });

  return result.html;
}
