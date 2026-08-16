/**
 * Client-side router for Nix.js Kit.
 *
 * Intercepts clicks on internal links, fetches the rendered page body from
 * `/__nix-js/render`, swaps the `#app` content and updates the history state.
 * This is loaded as part of the client bundle instead of being inlined in
 * every HTML page.
 *
 * Features:
 * - SPA navigation with head merge (title, meta, OG tags)
 * - Scroll restoration on back/forward
 * - Prefetch on viewport intersection and hover/focus (Astro-style)
 * - View Transitions API with `prefers-reduced-motion` respect
 */

interface RenderPayload {
  title?: string;
  body: string;
  /** Set-Cookie value relayed by the server to clear a consumed action error. */
  clearActionErrorCookie?: string;
  /** `<head>` tags (title, meta, OG, twitter) to merge on navigation. */
  head?: string;
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

// =============================================================================
// --- Prefetch cache ---
// =============================================================================

const PREFETCH_TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  payload: RenderPayload;
  ts: number;
}

const prefetchCache = new Map<string, CacheEntry>();

/** Builds the cache key from pathname + search. */
function cacheKey(pathname: string, search: string): string {
  return pathname + search;
}

/** Returns a cached payload if fresh, otherwise undefined. */
function getCached(key: string): RenderPayload | undefined {
  const entry = prefetchCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > PREFETCH_TTL_MS) {
    prefetchCache.delete(key);
    return undefined;
  }
  return entry.payload;
}

/** Stores a payload in the prefetch cache. */
function setCached(key: string, payload: RenderPayload): void {
  prefetchCache.set(key, { payload, ts: Date.now() });
}

/**
 * Fetches the render payload for a path. Uses the prefetch cache when fresh.
 * Stores the result in the cache for subsequent navigations.
 */
async function fetchPayload(pathname: string, search: string): Promise<RenderPayload | undefined> {
  const key = cacheKey(pathname, search);
  const cached = getCached(key);
  if (cached) return cached;

  const url = new URL("/__nix-js/render", location.origin);
  url.searchParams.set("page", pathname);
  const current = new URL(location.href);
  url.searchParams.set("search", search || current.search);

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;

  let payload: RenderPayload;
  try {
    payload = await response.json();
  } catch {
    return undefined;
  }

  setCached(key, payload);
  return payload;
}

/**
 * Prefetches a path without navigating. Called by the IntersectionObserver
 * when a link enters the viewport, and on hover/focus.
 */
export async function prefetch(pathname: string, search = ""): Promise<void> {
  const key = cacheKey(pathname, search);
  if (prefetchCache.has(key)) {
    // Already cached or in-flight — skip.
    const entry = prefetchCache.get(key)!;
    if (Date.now() - entry.ts <= PREFETCH_TTL_MS) return;
  }
  await fetchPayload(pathname, search);
}

// =============================================================================
// --- View Transitions ---
// =============================================================================

/** Returns true if the user prefers reduced motion. */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Returns true if the View Transitions API is available. */
function supportsViewTransitions(): boolean {
  return typeof (document as any).startViewTransition === "function";
}

// =============================================================================
// --- Navigation ---
// =============================================================================

/**
 * Hoists `<link rel="stylesheet">` and `<style>` tags from inside `#app` into
 * `<head>` so they persist across SPA navigations (prevents FOUC/flashing).
 * Deduplicates by `href` for links and by text content for styles.
 */
export function hoistStyles(container: ParentNode): void {
  const links = container.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');
  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href) continue;
    // Already in <head>?
    const existing = document.head.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) {
      link.remove();
      continue;
    }
    // Mark as hoisted so we can clean up later if needed
    link.setAttribute("data-nix-js-hoisted", "");
    document.head.appendChild(link);
  }

  const styles = container.querySelectorAll<HTMLStyleElement>("style");
  for (const style of styles) {
    const text = style.textContent?.trim();
    if (!text) continue;
    // Check if an identical style already exists in <head>
    const existing = Array.from(document.head.querySelectorAll("style")).find(
      (s) => s.textContent?.trim() === text,
    );
    if (existing) {
      style.remove();
      continue;
    }
    style.setAttribute("data-nix-js-hoisted", "");
    document.head.appendChild(style);
  }
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
  const payload = await fetchPayload(pathname, search);
  if (!payload) return false;

  const app = document.getElementById("app");
  if (!app) return false;

  // Save scroll position in the current history entry before navigating.
  if (push) {
    history.replaceState(
      { n: location.pathname, scroll: window.scrollY },
      "",
      location.href,
    );
  }

  const current = new URL(location.href);
  const doSwap = () => {
    // Hoist any stylesheets from the current #app content to <head> before
    // the swap, so they persist and don't cause a flash.
    hoistStyles(app);

    // Parse the new body and hoist its styles before injecting, so the
    // browser never sees a frame without styles.
    const temp = document.createElement("template");
    temp.innerHTML = payload.body;
    hoistStyles(temp.content as unknown as HTMLElement);

    // Inject the remaining body (styles already moved to <head>)
    app.innerHTML = temp.innerHTML;
    mergeHead(payload.head, payload.title);
    if (payload.clearActionErrorCookie) {
      document.cookie = payload.clearActionErrorCookie;
    }
    if (push) {
      history.pushState({ n: pathname, scroll: 0 }, "", pathname + (search || current.search));
    }
    const savedScroll = push ? 0 : (history.state?.scroll ?? 0);
    window.scrollTo(0, savedScroll);
    document.dispatchEvent(new CustomEvent("nix-js:rendered"));
  };

  // Use View Transitions when available and the user hasn't opted out.
  const useTransition = supportsViewTransitions() && !prefersReducedMotion();
  if (useTransition) {
    (document as any).startViewTransition(() => doSwap());
  } else {
    doSwap();
  }

  return true;
}

/**
 * Replaces all `<head>` tags marked with `data-nix-js-head` with the new ones
 * from the server payload. Also updates `document.title` when a title tag is
 * present in the new head.
 */
function mergeHead(head: string | undefined, fallbackTitle: string | undefined): void {
  // Remove existing managed tags.
  const existing = document.querySelectorAll("[data-nix-js-head]");
  existing.forEach((el) => el.remove());

  if (head && head.trim().length > 0) {
    // Parse the head tags from the server and insert them into <head>.
    const parser = document.createElement("template");
    parser.innerHTML = head;
    const fragment = parser.content;
    // Extract the <title> if present and set document.title directly.
    const titleEl = fragment.querySelector("title");
    if (titleEl) {
      document.title = titleEl.textContent ?? "";
      titleEl.remove();
    }
    document.head.appendChild(fragment);
  } else if (fallbackTitle) {
    document.title = fallbackTitle;
  }
}

// =============================================================================
// --- Link prefetch observers ---
// =============================================================================

/** Set of links currently being observed for viewport prefetch. */
const observedLinks = new WeakSet<HTMLAnchorElement>();

/**
 * Sets up prefetch on visible internal links. Uses IntersectionObserver to
 * prefetch when a link enters the viewport. Also prefetches on hover/focus
 * for instant navigation on interaction.
 */
function setupLinkPrefetch(): void {
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const link = entry.target as HTMLAnchorElement;
        if (!isInternalLink(link) || link.hasAttribute("data-no-prefetch")) continue;
        const href = link.getAttribute("href");
        if (!href || href.startsWith("#") || href.startsWith("mailto:")) continue;
        const qIndex = href.indexOf("?");
        const path = qIndex === -1 ? href : href.slice(0, qIndex);
        const search = qIndex === -1 ? "" : href.slice(qIndex);
        void prefetch(path, search);
        observer.unobserve(link);
      }
    },
    { rootMargin: "100px", threshold: 0 },
  );

  // Observe existing links and watch for new ones via MutationObserver.
  const observeLinks = () => {
    const links = document.querySelectorAll<HTMLAnchorElement>("a[href]");
    for (const link of links) {
      if (observedLinks.has(link)) continue;
      if (!isInternalLink(link) || link.hasAttribute("data-no-prefetch")) continue;
      observedLinks.add(link);
      observer.observe(link);

      // Also prefetch on hover/focus for instant navigation.
      link.addEventListener("pointerenter", () => {
        const href = link.getAttribute("href");
        if (!href) return;
        const qIndex = href.indexOf("?");
        const path = qIndex === -1 ? href : href.slice(0, qIndex);
        const search = qIndex === -1 ? "" : href.slice(qIndex);
        void prefetch(path, search);
      }, { once: true });
    }
  };

  observeLinks();

  // Re-scan when the DOM changes (e.g. after SPA navigation).
  const mutationObserver = new MutationObserver(() => observeLinks());
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  // Re-scan after each SPA navigation.
  document.addEventListener("nix-js:rendered", observeLinks);
}

// =============================================================================
// --- Router bootstrap ---
// =============================================================================

export function startClientRouter(): void {
  // Hoist styles from #app to <head> immediately on page load.
  // This prevents FOUC on the first SPA navigation.
  const app = document.getElementById("app");
  if (app) hoistStyles(app);

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
    const state = event.state as { n?: string; scroll?: number } | null;
    const target = state?.n ?? location.pathname;
    void navigateTo(target, location.search, false);
  });

  setupLinkPrefetch();
}
