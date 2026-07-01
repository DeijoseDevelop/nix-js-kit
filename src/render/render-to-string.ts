import type { NixTemplate } from "@deijose/nix-js";

// =============================================================================
// --- Build-time / server rendering ---
// =============================================================================
//
// Nix.js has no `renderToString`: its `html`` pipeline depends on a DOM
// (`document.createElement("template")`, `innerHTML` parsing, `createTreeWalker`).
// Rather than adding a DOM dependency to the core (which must stay zero-dep and
// ~6KB), the kit injects a Node-side DOM only at build/server time.
//
// happy-dom is used because the Nix.js core test-suite already runs under it,
// so full-pipeline compatibility (NodeFilter, TreeWalker, template.content) is
// proven. It is loaded via dynamic import so it never leaks into client code.
// =============================================================================

/** Globals the Nix.js core reads off `globalThis` during rendering. */
const MANAGED_GLOBALS = [
  "document",
  "Node",
  "NodeFilter",
  "Comment",
  "Text",
  "Element",
  "HTMLElement",
  "DocumentFragment",
] as const;

/**
 * Renders a Nix.js template to an HTML string in Node.
 *
 * Accepts a *factory* (not a template) because `html`` evaluates — and needs a
 * `document` — at call time. The factory is invoked only after the DOM globals
 * are installed.
 *
 * @param factory Thunk that builds the template, e.g. `() => Page({ data })`.
 * @returns Serialized inner HTML of the rendered template.
 */
export async function renderToString(
  factory: () => NixTemplate,
): Promise<string> {
  const { Window } = await import("happy-dom");
  const window = new Window({ url: "http://localhost/" });

  const g = globalThis as Record<string, unknown>;
  const saved: Record<string, unknown> = {};
  for (const key of MANAGED_GLOBALS) {
    saved[key] = g[key];
    g[key] = (window as unknown as Record<string, unknown>)[key];
  }

  try {
    const template = factory();
    const container = window.document.createElement("div");
    template._render(container as unknown as Node, null);
    return container.innerHTML;
  } finally {
    for (const key of MANAGED_GLOBALS) {
      g[key] = saved[key];
    }
    await window.happyDOM.close();
  }
}
