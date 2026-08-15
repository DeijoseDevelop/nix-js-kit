/**
 * Client-side router for Nix Kit.
 *
 * Intercepts clicks on internal links, fetches the rendered page body from
 * `/__nix-js/render`, swaps the `#app` content and updates the history state.
 * This is loaded as part of the client bundle instead of being inlined in
 * every HTML page.
 */

interface RenderPayload {
  title?: string;
  body: string;
}

function isInternalLink(link: HTMLAnchorElement): boolean {
  return (
    link.tagName === "A" &&
    link.hostname === location.hostname &&
    link.target === "" &&
    !link.getAttribute("download") &&
    !link.hasAttribute("data-no-router")
  );
}

function hasModifier(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * Navigates to a page without a full reload: fetches the fresh body from the
 * `/__nix-js/render` endpoint, swaps `#app`, updates the document title and
 * dispatches `nix-js:rendered` so islands re-hydrate. Used by the router on
 * clicks and available for programmatic navigation (e.g. after a server
 * action returns a redirect, so the target page shows fresh server data).
 *
 * @param pathname Path without query, e.g. "/movies/inception".
 * @param search Query string, e.g. "?reviewed=1" (optional).
 * @param push Whether to push a history entry (default true).
 * @returns true on success, false if the render failed.
 */
export async function navigateTo(pathname: string, search = "", push = true): Promise<boolean> {
  const url = new URL("/__nix-js/render", location.origin);
  url.searchParams.set("page", pathname);
  const current = new URL(location.href);
  url.searchParams.set("search", search || current.search);

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  } catch {
    return false;
  }
  if (!response.ok) return false;

  let payload: RenderPayload;
  try {
    payload = await response.json();
  } catch {
    return false;
  }

  const app = document.getElementById("app");
  if (!app) return false;

  app.innerHTML = payload.body;
  if (payload.title) document.title = payload.title;
  if (push) history.pushState({ n: pathname }, "", pathname + (search || current.search));
  window.scrollTo(0, 0);
  document.dispatchEvent(new CustomEvent("nix-js:rendered"));
  return true;
}

export function startClientRouter(): void {
  document.addEventListener("click", async (event) => {
    if (!(event instanceof MouseEvent) || hasModifier(event)) return;
    if (event.defaultPrevented) return;
    const link = (event.target as HTMLElement).closest("a");
    if (!link || !isInternalLink(link as HTMLAnchorElement)) return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) return;

    event.preventDefault();
    const qIndex = href.indexOf("?");
    const path = qIndex === -1 ? href : href.slice(0, qIndex);
    const search = qIndex === -1 ? "" : href.slice(qIndex);
    if (!(await navigateTo(path, search))) {
      location.assign(href);
    }
  });

  window.addEventListener("popstate", (event) => {
    const state = (event.state && (event.state as { n?: string }).n) || undefined;
    if (state) {
      void navigateTo(state, "", false);
    } else {
      void navigateTo(location.pathname, location.search, false);
    }
  });
}
