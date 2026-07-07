import type { NixTemplate } from "@deijose/nix-js";
import { renderToString } from "../render/render-to-string";
import { documentShell } from "../build/document-shell";
import type { PageRoute, ScannedRoutes } from "../router/route-scanner";
import type { BuildConfig } from "../build/build";
import type { PageDataLoad, PageProps, RouteParams } from "../types";
import { existsSync } from "node:fs";

export interface RenderPageOptions {
  route: PageRoute;
  params?: RouteParams;
  searchParams?: URLSearchParams;
  config: Pick<BuildConfig, "lang" | "clientEntry">;
  /** Custom module loader. Defaults to native dynamic import. */
  importer?: (path: string) => Promise<unknown>;
  /** Per-page action names exposed in the HTML shell. */
  actions?: Record<string, string[]>;
  /** Current request, used to hydrate data loaders that need cookies/headers. */
  request?: Request;
}

export interface RenderPageResult {
  html: string;
  revalidate?: number;
}

const defaultImport = (path: string) => import(path);

export async function renderPage(options: RenderPageOptions): Promise<RenderPageResult> {
  const { route, params = {}, searchParams = new URLSearchParams(), config, importer = defaultImport, actions, request } = options;

  const { default: PageComponent } = await importer(route.pagePath) as {
    default: (props: PageProps<unknown>) => NixTemplate;
  };

  let data: unknown;
  let revalidate: number | undefined;
  if (route.dataPath) {
    const mod = await importer(route.dataPath) as { load?: PageDataLoad; revalidate?: number };
    if (mod.load) {
      data = await mod.load({ params, searchParams, request });
    }
    if (typeof mod.revalidate === "number") {
      revalidate = mod.revalidate;
    }
  }

  const props: PageProps<unknown> = {
    data: data ?? {},
    params,
    searchParams,
  };

  const layoutModules = await Promise.all(
    route.layouts.map(async (layoutPath) => importer(layoutPath)),
  );
  const layoutDataList = await Promise.all(
    route.layouts.map(async (layoutPath) => {
      const dataPath = layoutPath.replace(/layout\.ts$/, "layout.data.ts");
      if (!existsSync(dataPath)) return undefined;
      const mod = (await importer(dataPath)) as { load?: PageDataLoad };
      if (mod.load) {
        return await mod.load({ params, searchParams, request });
      }
      return undefined;
    }),
  );

  const body = await renderToString(() => {
    let template = PageComponent(props);
    for (let i = layoutModules.length - 1; i >= 0; i--) {
      const { default: Layout } = layoutModules[i] as {
        default: (props: { children: NixTemplate; data?: unknown }) => NixTemplate;
      };
      template = Layout({ children: template, data: layoutDataList[i] });
    }
    return template;
  });

  const title = typeof data === "object" && data && "title" in data
    ? String((data as { title?: unknown }).title ?? "Nix Kit")
    : "Nix Kit";

  const html = documentShell({
    title,
    lang: config.lang,
    body,
    data,
    actions,
    clientEntry: config.clientEntry,
  });

  return { html, revalidate };
}

export interface RenderErrorPageOptions {
  routes: ScannedRoutes;
  status: 404 | 500;
  error?: unknown;
  config: Pick<BuildConfig, "lang" | "clientEntry">;
  actions?: Record<string, string[]>;
  importer?: (path: string) => Promise<unknown>;
}

export async function renderErrorPage(
  options: RenderErrorPageOptions,
): Promise<{ html: string; status: number } | undefined> {
  const route = options.status === 404 ? options.routes.error404 : options.routes.error500;
  if (!route) return undefined;

  try {
    const { html } = await renderPage({
      route,
      params: {},
      searchParams: new URLSearchParams(),
      config: options.config,
      actions: options.actions,
      importer: options.importer,
    });
    return { html, status: options.status };
  } catch (err) {
    console.error(`[render] error ${options.status} page failed`, err);
    return undefined;
  }
}
