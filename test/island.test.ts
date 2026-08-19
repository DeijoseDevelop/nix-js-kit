import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { html } from "@deijose/nix-js";
import { cleanupHydratedIslands, hydrateIslands, type IslandRegistry } from "../src/island/hydrate.ts";
import { island, type IslandComponent } from "../src/island/island.ts";
import { renderToString } from "../src/render/render-to-string.ts";

function textTemplate(value: string) {
  return {
    __isNixTemplate: true as const,
    _render(parent: Node, before: Node | null) {
      const node = document.createTextNode(value);
      parent.insertBefore(node, before);
      return () => node.parentNode?.removeChild(node);
    },
  };
}

describe("island hydration", () => {
  let window: Window;

  beforeEach(() => {
    window = new Window({ url: "http://localhost/" });
    const globals = globalThis as Record<string, unknown>;
    globals.window = window;
    globals.document = window.document;
    globals.Node = window.Node;
    globals.NodeFilter = window.NodeFilter;
    globals.Comment = window.Comment;
    globals.Text = window.Text;
    globals.Element = window.Element;
    globals.HTMLElement = window.HTMLElement;
  });

  afterEach(() => {
    cleanupHydratedIslands();
    window.close();
  });

  it("treats null as an empty island and continues hydrating siblings", () => {
    document.body.innerHTML = [
      '<div data-nix-js-island="Empty" data-props="{}"><p>SSR fallback</p></div>',
      '<div data-nix-js-island="Ready" data-props="{}"></div>',
    ].join("");
    const registry = {
      Empty: () => null,
      Ready: () => textTemplate("hydrated"),
    } as unknown as IslandRegistry;

    assert.doesNotThrow(() => hydrateIslands(registry));
    assert.equal(document.querySelector('[data-nix-js-island="Empty"]')?.textContent, "SSR fallback");
    assert.equal(document.querySelector('[data-nix-js-island="Ready"]')?.textContent, "hydrated");
  });

  it("hydrates server markers without replacing the island DOM", async () => {
    let clicks = 0;
    const component = () => html`
        <button @click=${() => { clicks++; }}>${"Ready"}</button>
    `;
    document.body.innerHTML = await renderToString(() => island("Ready", component, {}));
    const button = document.querySelector("button")!;

    hydrateIslands({ Ready: component });

    assert.equal(document.querySelector("button"), button);
    button.click();
    assert.equal(clicks, 1);
  });

  it("renders an empty SSR marker when the component returns null", () => {
    const component = (() => null) as unknown as IslandComponent<Record<string, never>>;
    const template = island("Empty", component, {});
    const container = document.createElement("div");

    assert.doesNotThrow(() => template._render(container, null));
    assert.equal(container.querySelector('[data-nix-js-island="Empty"]')?.innerHTML, "");
  });

  it("isolates malformed props and hydrates valid siblings", () => {
    document.body.innerHTML = [
      '<div data-nix-js-island="Broken" data-props="{"><p>SSR fallback</p></div>',
      '<div data-nix-js-island="Ready" data-props="{}"></div>',
    ].join("");
    const registry = {
      Broken: () => textTemplate("broken"),
      Ready: () => textTemplate("hydrated"),
    } as unknown as IslandRegistry;

    assert.doesNotThrow(() => hydrateIslands(registry));
    assert.equal(document.querySelector('[data-nix-js-island="Broken"]')?.textContent, "SSR fallback");
    assert.equal(document.querySelector('[data-nix-js-island="Ready"]')?.textContent, "hydrated");
  });

  it("supports async (lazy) island loaders", async () => {
    document.body.innerHTML = '<div data-nix-js-island="Lazy" data-props="{}"></div>';
    const registry = {
      Lazy: async () => () => textTemplate("lazy-hydrated"),
    } as unknown as IslandRegistry;

    hydrateIslands(registry);
    // Wait for the async import to resolve.
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(document.querySelector('[data-nix-js-island="Lazy"]')?.textContent, "lazy-hydrated");
  });

  it("isolates errors in one island and continues hydrating siblings", async () => {
    document.body.innerHTML = [
      '<div data-nix-js-island="Boom" data-props="{}"></div>',
      '<div data-nix-js-island="Ok" data-props="{}"></div>',
    ].join("");
    const registry = {
      Boom: () => { throw new Error("boom"); },
      Ok: () => textTemplate("ok"),
    } as unknown as IslandRegistry;

    assert.doesNotThrow(() => hydrateIslands(registry));
    assert.equal(document.querySelector('[data-nix-js-island="Ok"]')?.textContent, "ok");
  });

  it("warns when an island is not registered", () => {
    document.body.innerHTML = '<div data-nix-js-island="Missing" data-props="{}"><p>fallback</p></div>';
    const originalWarn = console.warn;
    let warned = false;
    console.warn = (msg: string) => { if (msg.includes("Missing")) warned = true; };
    try {
      hydrateIslands({} as IslandRegistry);
    } finally {
      console.warn = originalWarn;
    }
    assert.ok(warned, "should warn about missing island");
    assert.equal(document.querySelector('[data-nix-js-island="Missing"]')?.textContent, "fallback");
  });
});

describe("island entry generator: lazy imports", () => {
  it("generates dynamic import() calls for code-splitting", () => {
    const { buildEntrySource } = require("../src/island/generate-entry.ts");
    const source = buildEntrySource(
      [
        { name: "Counter", filePath: "/project/src/islands/Counter.ts" },
        { name: "Search", filePath: "/project/src/islands/Search.ts" },
      ],
      "/project/.nix-js/entry-client.ts",
    );

    // Should use dynamic import() not static import.
    assert.ok(source.includes("import("), "should use dynamic import()");
    assert.ok(!source.match(/^import \w+ from/m), "should not use static imports for islands");
    assert.ok(source.includes('"Counter"'), "should register Counter");
    assert.ok(source.includes('"Search"'), "should register Search");
    assert.ok(source.includes("hydrateIslands(registry)"), "should call hydrateIslands");
  });

  it("generates empty entry when no islands exist", () => {
    const { buildEntrySource } = require("../src/island/generate-entry.ts");
    const source = buildEntrySource([], "/project/.nix-js/entry-client.ts");
    assert.ok(!source.includes("hydrateIslands(registry)"), "should not hydrate when no islands");
    assert.ok(source.includes("startClientRouter()"), "should still start the router");
  });
});
