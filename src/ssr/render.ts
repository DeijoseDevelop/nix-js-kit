import { renderToString } from "../render/render-to-string";
import { documentShell } from "../build/document-shell";
import type { PageRoute } from "../router/route-scanner";
import type { BuildConfig } from "../build/build";
import type { PageDataLoad, PageProps, RouteParams } from "../types";

export interface RenderPageOptions {
  route: PageRoute;
  params: RouteParams;
  searchParams: URLSearchParams;
  config: Pick<BuildConfig, "lang" | "clientEntry">;
}

export async function renderPage(options: RenderPageOptions): Promise<string> {
  const { route, params, searchParams, config } = options;

  const { default: PageComponent } = await import(route.pagePath);

  let data: unknown;
  if (route.dataPath) {
    const { load } = await import(route.dataPath) as { load?: PageDataLoad };
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
    route.layouts.map(async (layoutPath) => import(layoutPath)),
  );

  const body = await renderToString(() => {
    let template = PageComponent(props);
    for (let i = layoutModules.length - 1; i >= 0; i--) {
      const { default: Layout } = layoutModules[i];
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
    clientEntry: config.clientEntry,
  });
}
