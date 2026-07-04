import type { NixTemplate } from "@deijose/nix-js";
import { renderToString } from "../render/render-to-string";
import { documentShell } from "../build/document-shell";
import type { PageRoute, ScannedRoutes } from "../router/route-scanner";
import type { BuildConfig } from "../build/build";
import type { PageDataLoad, PageProps, RouteParams } from "../types";
import type { ActionRegistry } from "../action/scan";

export interface RenderPageOptions {
  route: PageRoute;
  params: RouteParams;
  searchParams: URLSearchParams;
  config: Pick<BuildConfig, "lang" | "clientEntry">;
  /** Custom module loader. Defaults to native dynamic import. */
  importer?: (path: string) => Promise<unknown>;
  /** Per-page registry of available server actions. */
  actions?: ActionRegistry;
}

const defaultImport = (path: string) => import(path);

export async function renderPage(options: RenderPageOptions): Promise<string> {
  const { route, params, searchParams, config, importer = defaultImport, actions } = options;

  const { default: PageComponent } = await importer(route.pagePath) as {
    default: (props: PageProps<unknown>) => NixTemplate;
  };

  let data: unknown;
  if (route.dataPath) {
    const { load } = await importer(route.dataPath) as { load?: PageDataLoad };
    if (load) {
      data = await load({ params, searchParams });
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

  const body = await renderToString(() => {
    let template = PageComponent(props);
    for (let i = layoutModules.length - 1; i >= 0; i--) {
      const { default: Layout } = layoutModules[i] as {
        default: (props: { children: NixTemplate }) => NixTemplate;
      };
      template = Layout({ children: template });
    }
    return template;
  });

  const title = typeof data === "object" && data && "title" in data
    ? String((data as { title?: unknown }).title ?? "Nix Kit")
    : "Nix Kit";

  return documentShell({
    title,
    lang: config.lang,
    body,
    data,
    actions,
    clientEntry: config.clientEntry,
  });
}

export interface RenderErrorPageOptions {
  routes: ScannedRoutes;
  status: 404 | 500;
  error?: unknown;
  config: Pick<BuildConfig, "lang" | "clientEntry">;
  actions?: ActionRegistry;
  importer?: (path: string) => Promise<unknown>;
}

export async function renderErrorPage(
  options: RenderErrorPageOptions,
): Promise<{ html: string; status: number } | undefined> {
  const route = options.status === 404 ? options.routes.error404 : options.routes.error500;
  if (!route) return undefined;

  try {
    const html = await renderPage({
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
