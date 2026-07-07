import type { NixTemplate } from "@deijose/nix-js";

// =============================================================================
// --- Client-side island hydration ---
// =============================================================================

// Keep track of every active island dispose so we can clean them up before a
// client-side navigation swaps the whole #app content.
const _islandDisposes = new Set<() => void>();

// Finds [data-nix-js-island] markers in the current document and mounts the
// corresponding interactive components over them. This runs in the browser.

export type IslandComponent<TProps = unknown> = (props: TProps) => NixTemplate;

export type IslandRegistry = Record<string, IslandComponent<any>>;

export type IslandDirective = "load" | "idle" | "visible";

interface IslandMarker {
  el: HTMLElement;
  name: string;
  directive: IslandDirective;
  props: unknown;
}

function collectMarkers(): IslandMarker[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("[data-nix-js-island]"),
  );
  return elements.map((el) => ({
    el,
    name: el.dataset.nixJsIsland ?? "",
    directive: (el.dataset.directive as IslandDirective) ?? "load",
    props: el.dataset.props ? JSON.parse(el.dataset.props) : null,
  }));
}

function hydrate(marker: IslandMarker, registry: IslandRegistry): void {
  const Component = registry[marker.name];
  if (!Component) {
    console.warn(`[nix-js-kit] No island registered for "${marker.name}"`);
    return;
  }

  // Clean up a previous hydration for this same marker wrapper.
  const prevDispose = (marker.el as any).__nix_island_dispose;
  if (typeof prevDispose === "function") {
    prevDispose();
  }

  // Render the live component into a fragment and swap the entire island content
  // in one DOM operation to avoid a visible flash.
  const fragment = document.createDocumentFragment();
  const dispose = Component(marker.props)._render(fragment, null);

  const wrappedDispose = () => {
    dispose();
    _islandDisposes.delete(wrappedDispose);
  };
  (marker.el as any).__nix_island_dispose = wrappedDispose;
  _islandDisposes.add(wrappedDispose);

  const children = Array.from(fragment.childNodes);
  marker.el.replaceChildren(...children);
}

/**
 * Hydrates all islands on the page using the provided registry.
 *
 * @param registry Map from island name to component factory.
 */
/**
 * Dispose all currently hydrated islands. Called by the client router before
 * swapping the page body to prevent leaked effects and stale DOM writes.
 */
export function cleanupHydratedIslands(): void {
  for (const dispose of _islandDisposes) {
    dispose();
  }
  _islandDisposes.clear();
}

export function hydrateIslands(registry: IslandRegistry): void {
  if (typeof window === "undefined") return;

  const markers = collectMarkers();

  for (const marker of markers) {
    if (marker.directive === "load") {
      hydrate(marker, registry);
      continue;
    }

    if (marker.directive === "idle") {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => hydrate(marker, registry));
      } else {
        setTimeout(() => hydrate(marker, registry), 0);
      }
      continue;
    }

    if (marker.directive === "visible") {
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                hydrate(marker, registry);
                observer.disconnect();
              }
            }
          },
          { rootMargin: "0px", threshold: 0 },
        );
        observer.observe(marker.el);
      } else {
        hydrate(marker, registry);
      }
    }
  }
}
