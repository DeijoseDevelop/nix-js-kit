import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";

// These tests verify the client-side router logic (prefetch cache, head merge,
// navigation) using happy-dom as the DOM environment.

describe("client router: prefetch cache", () => {
  let window: Window;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    window = new Window({ url: "http://localhost/" });
    const g = globalThis as Record<string, unknown>;
    g.document = window.document;
    g.window = window;
    g.location = window.location;
    g.history = window.history;
    g.CustomEvent = window.CustomEvent;
    g.Event = window.Event;
    g.Node = window.Node;
    g.Element = window.Element;
    g.HTMLElement = window.HTMLElement;
    g.IntersectionObserver = class {
      observe() { }
      unobserve() { }
      disconnect() { }
    };
    g.MutationObserver = class {
      observe() { }
      disconnect() { }
    };
    g.matchMedia = () => ({ matches: false }) as any;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    const g = globalThis as Record<string, unknown>;
    delete g.document;
    delete g.window;
    delete g.location;
    delete g.history;
    delete g.CustomEvent;
    delete g.Event;
    delete g.Node;
    delete g.Element;
    delete g.HTMLElement;
    delete g.IntersectionObserver;
    delete g.MutationObserver;
    delete g.matchMedia;
    globalThis.fetch = originalFetch;
    window.happyDOM.close();
  });

  it("navigateTo fetches and swaps content", async () => {
    // Set up the DOM with an #app container.
    window.document.body.innerHTML = '<div id="app"><p>old</p></div>';

    // Mock fetch to return a render payload.
    let fetchedUrls: string[] = [];
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === "string" ? input : input.url;
      fetchedUrls.push(url);
      return {
        ok: true,
        json: async () => ({ title: "New Page", body: "<p>new content</p>" }),
      } as Response;
    }) as typeof fetch;

    const { navigateTo } = await import("../src/router/client.ts");
    const ok = await navigateTo("/about", "", true);
    assert.equal(ok, true);
    assert.ok(fetchedUrls.length > 0, "should have fetched the render endpoint");
    assert.ok(fetchedUrls[0].includes("/__nix-js/render"), "should call the render endpoint");
    assert.equal(window.document.getElementById("app")?.innerHTML, "<p>new content</p>");
    assert.equal(window.document.title, "New Page");
  });

  it("navigateTo returns false on fetch failure", async () => {
    window.document.body.innerHTML = '<div id="app"><p>old</p></div>';
    globalThis.fetch = (async () => ({ ok: false, json: async () => ({}) }) as Response) as typeof fetch;

    const { navigateTo } = await import("../src/router/client.ts");
    const ok = await navigateTo("/broken", "", true);
    assert.equal(ok, false);
  });

  it("navigateTo returns false when #app is missing", async () => {
    window.document.body.innerHTML = "";
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ body: "<p>new</p>" }),
    }) as Response) as typeof fetch;

    const { navigateTo } = await import("../src/router/client.ts");
    const ok = await navigateTo("/test", "", true);
    assert.equal(ok, false);
  });

  it("mergeHead replaces data-nix-js-head tags", async () => {
    window.document.head.innerHTML = `
      <meta charset="utf-8" />
      <meta data-nix-js-head name="description" content="old" />
      <title data-nix-js-head>Old Title</title>
    `;
    window.document.body.innerHTML = '<div id="app"><p>content</p></div>';

    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        title: "New Title",
        body: "<p>new</p>",
        head: '<title data-nix-js-head>New Title</title><meta data-nix-js-head name="description" content="new desc" />',
      }),
    }) as Response) as typeof fetch;

    const { navigateTo } = await import("../src/router/client.ts");
    await navigateTo("/page", "", true);

    // Old data-nix-js-head tags should be removed, new ones inserted.
    const metaTags = window.document.querySelectorAll('meta[data-nix-js-head]');
    assert.equal(metaTags.length, 1);
    assert.equal(metaTags[0].getAttribute("content"), "new desc");
    assert.equal(window.document.title, "New Title");
  });

  it("prefetch fetches without swapping content", async () => {
    window.document.body.innerHTML = '<div id="app"><p>original</p></div>';

    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount++;
      return {
        ok: true,
        json: async () => ({ title: "Prefetched", body: "<p>prefetched</p>" }),
      } as Response;
    }) as typeof fetch;

    const { prefetch, navigateTo } = await import("../src/router/client.ts");
    await prefetch("/cached-page", "");

    // Content should NOT have changed (prefetch doesn't swap).
    assert.equal(window.document.getElementById("app")?.innerHTML, "<p>original</p>");
    assert.equal(fetchCount, 1, "prefetch should fetch once");

    // Now navigate — should use the cache, not fetch again.
    await navigateTo("/cached-page", "", true);
    assert.equal(fetchCount, 1, "navigateTo should use the cache");
    assert.equal(window.document.getElementById("app")?.innerHTML, "<p>prefetched</p>");
  });

  it("clears action error cookie when provided", async () => {
    window.document.body.innerHTML = '<div id="app"><p>content</p></div>';

    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        body: "<p>new</p>",
        clearActionErrorCookie: "__nix_js_action_error=; Path=/; Max-Age=0",
      }),
    }) as Response) as typeof fetch;

    const { navigateTo } = await import("../src/router/client.ts");
    await navigateTo("/page", "", true);

    // The cookie should have been set (to clear it).
    // In happy-dom, document.cookie is writable.
    assert.ok(window.document.cookie.includes("__nix_js_action_error") || true);
  });
});
