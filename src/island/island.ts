import type { NixTemplate } from "@deijose/nix-js";

// =============================================================================
// --- Islands helper ---
// =============================================================================
//
// Marks a component as an island. During server-side rendering it emits a
// static placeholder with `data-nix-island` attributes. The client entry finds
// these markers and hydrates them with the real component + reactive signals.
//
// This is a minimal v0.2 implementation. Later versions will integrate with
// a Vite plugin for automatic client bundle splitting.
// =============================================================================

export type IslandDirective = "load" | "idle" | "visible";

export interface IslandComponent<TProps = unknown> {
  (props: TProps): NixTemplate;
}

/**
 * Renders a component to a static HTML string with island markers.
 *
 * @param name Unique island name used by the client entry to look up the module.
 * @param component Server-side island component.
 * @param props Props passed to the component and serialized for hydration.
 * @param directive When to hydrate on the client.
 * @returns A NixTemplate that renders the island placeholder.
 */
export function island<TProps>(
  name: string,
  component: IslandComponent<TProps>,
  props: TProps,
  directive: IslandDirective = "load",
): NixTemplate {
  // Render the component to a string synchronously. We create a temporary
  // container, render into it, and read innerHTML. This is server-side only.
  const container = document.createElement("div");
  component(props)._render(container, null);
  const innerHtml = container.innerHTML;

  const markerHtml = `<div data-nix-island="${escapeHtml(name)}" data-directive="${directive}" data-props='${serializeProps(props)}'>${innerHtml}</div>`;

  return {
    __isNixTemplate: true as const,
    _render(parent: Node, before: Node | null): () => void {
      const wrapper = document.createElement("template");
      wrapper.innerHTML = markerHtml;
      const fragment = wrapper.content;
      const inserted = fragment.firstChild;
      parent.insertBefore(fragment, before);
      return () => {
        if (inserted?.parentNode) {
          inserted.parentNode.removeChild(inserted);
        }
      };
    },
  } as unknown as NixTemplate;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeProps(props: unknown): string {
  return JSON.stringify(props ?? null).replace(/</g, "\\u003c");
}
