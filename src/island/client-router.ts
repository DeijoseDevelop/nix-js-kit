/**
 * Lightweight client-side router for nix-js-kit pages.
 *
 * Intercepts clicks on internal links, fetches the rendered page body from the
 * SSR endpoint (`/__nix-js/render`), swaps the contents of `#app` and updates
 * the browser history so navigation feels like a SPA even on SSR deployments.
 */

function isInternalLink(el: HTMLAnchorElement): boolean {
  return (
    el.tagName === "A" &&
    el.hostname === location.hostname &&
    el.target === "" &&
    !el.getAttribute("download") &&
    !el.hasAttribute("data-no-router")
  );
}

async function navigate(path: string, push = true): Promise<void> {
  try {
    const url = new URL("/__nix-js/render", location.origin);
    url.searchParams.set("page", path);
    url.searchParams.set("search", location.search);
    const res = await fetch(url.toString(), {
      headers: { Accept: "text/html" },
    });
    if (!res.ok) throw new Error(`Render failed: ${res.status}`);
    const html = await res.text();
    const app = document.getElementById("app");
    if (!app) throw new Error("#app not found");
    app.innerHTML = html;
    document.title = extractTitle(html) || document.title;
    if (push) history.pushState({ nixJsPath: path }, "", path + location.search);
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent("nix-js:rendered"));
  } catch (err) {
    console.error("[nix-js-kit] client router error:", err);
    // Fall back to full navigation on error.
    location.assign(path + location.search);
  }
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title>([^<]*)<\/title>/);
  return match ? match[1] : null;
}

export function setupClientRouter(): void {
  if (typeof window === "undefined") return;

  document.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
    if (!el || !isInternalLink(el)) return;
    const path = el.getAttribute("href");
    if (!path || path.startsWith("#") || path.startsWith("mailto:")) return;
    e.preventDefault();
    void navigate(path);
  });

  window.addEventListener("popstate", (e) => {
    const path = (e.state as { nixJsPath?: string } | null)?.nixJsPath ?? location.pathname;
    void navigate(path, false);
  });
}
