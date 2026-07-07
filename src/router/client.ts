import { cleanupHydratedIslands } from "../island/index.js";

/**
 * Client-side router for Nix Kit.
 *
 * Intercepts clicks on internal links, fetches the rendered page body from
 * `/__nix-js/render`, swaps the `#app` content and updates the history state.
 * This is loaded as part of the client bundle instead of being inlined in
 * every HTML page.
 */

function isInternalLink(link: HTMLAnchorElement): boolean {
  return (
    link.tagName === "A" &&
    link.hostname === location.hostname &&
    link.target === "" &&
    !link.getAttribute("download") &&
    !link.hasAttribute("data-no-router")
  );
}

async function navigate(path: string, push = true): Promise<boolean> {
  const url = new URL("/__nix-js/render", location.origin);
  url.searchParams.set("page", path);
  url.searchParams.set("search", location.search);

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers: { Accept: "text/html" } });
  } catch {
    return false;
  }
  if (!response.ok) return false;

  const html = await response.text();
  const app = document.getElementById("app");
  if (!app) return false;

  cleanupHydratedIslands();
  app.innerHTML = html;
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  if (titleMatch) document.title = titleMatch[1];
  if (push) history.pushState({ n: path }, "", path + location.search);
  window.scrollTo(0, 0);
  document.dispatchEvent(new CustomEvent("nix-js:rendered"));
  return true;
}

export function startClientRouter(): void {
  document.addEventListener("click", async (event) => {
    const link = (event.target as HTMLElement).closest("a");
    if (!link || !isInternalLink(link as HTMLAnchorElement)) return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;

    event.preventDefault();
    if (!(await navigate(href))) {
      location.assign(href + location.search);
    }
  });

  window.addEventListener("popstate", (event) => {
    navigate((event.state && (event.state as { n?: string }).n) || location.pathname, false);
  });
}
