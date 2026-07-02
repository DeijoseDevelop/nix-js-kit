import type { NixTemplate } from "@deijose/nix-js";

// =============================================================================
// --- Client-side island hydration ---
// =============================================================================
//
// Finds [data-nix-island] markers in the current document and mounts the
// corresponding interactive components over them. This runs in the browser.
// =============================================================================

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
    document.querySelectorAll<HTMLElement>("[data-nix-island]"),
  );
  return elements.map((el) => ({
    el,
    name: el.dataset.nixIsland ?? "",
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

  // Clear the static HTML and mount the live component.
  marker.el.innerHTML = "";
  Component(marker.props)._render(marker.el, null);
}

/**
 * Hydrates all islands on the page using the provided registry.
 *
 * @param registry Map from island name to component factory.
 */
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
