import type { NixTemplate } from "@deijose/nix-js";
import { hydrate as hydrateTemplate } from "@deijose/nix-js/hydrate";

// =============================================================================
// --- Client-side island hydration ---
// =============================================================================

// Keep track of every active island dispose so we can clean them up before a
// client-side navigation swaps the whole #app content.
const _islandDisposes = new Set<() => void>();
const _islandSchedules = new Set<() => void>();

// Finds [data-nix-js-island] markers in the current document and mounts the
// corresponding interactive components over them. This runs in the browser.

export type IslandComponent<TProps = unknown> = (props: TProps) => NixTemplate | null | false | undefined;

/**
 * Island registry entry. Can be either:
 *   - A direct component function (eager loading, legacy).
 *   - An async loader function that returns the component (lazy loading).
 */
export type IslandRegistryEntry<TProps = unknown> =
  | IslandComponent<TProps>
  | (() => Promise<IslandComponent<TProps>>);

export type IslandRegistry = Record<string, IslandRegistryEntry<any>>;

export type IslandDirective = "load" | "idle" | "visible";

interface IslandMarker {
  el: HTMLElement;
  name: string;
  directive: IslandDirective;
  props: unknown;
  propsError?: unknown;
}

function collectMarkers(): IslandMarker[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("[data-nix-js-island]"),
  );
  return elements.map((el) => {
    const marker: IslandMarker = {
      el,
      name: el.dataset.nixJsIsland ?? "",
      directive: (el.dataset.directive as IslandDirective) ?? "load",
      props: null,
    };
    if (el.dataset.props) {
      try {
        marker.props = JSON.parse(el.dataset.props);
      } catch (error) {
        marker.propsError = error;
      }
    }
    return marker;
  });
}

async function hydrate(marker: IslandMarker, registry: IslandRegistry): Promise<void> {
  try {
    if (marker.propsError) {
      reportIslandError(marker, marker.propsError);
      return;
    }

    const entry = registry[marker.name];
    if (!entry) {
      console.warn(`[nix-js-kit] No island registered for "${marker.name}"`);
      return;
    }

    // Resolve the component: either a direct function (eager) or an async
    // loader (lazy/code-split). This enables per-island dynamic imports so
    // islands not on the current page stay out of the initial bundle.
    const Component = typeof entry === "function" && entry.constructor?.name === "AsyncFunction"
      ? await (entry as () => Promise<IslandComponent>)()
      : entry as IslandComponent;

    // Handle the case where the loader returns a module with default export.
    const resolved = (typeof Component === "function"
      ? Component
      : (Component as { default?: IslandComponent })?.default) as IslandComponent | undefined;

    if (typeof resolved !== "function") {
      console.warn(`[nix-js-kit] Island "${marker.name}" did not resolve to a component function`);
      return;
    }

    const template = resolved(marker.props);
    if (template === null || template === false || template === undefined) return;
    const prevDispose = (marker.el as any).__nix_js_island_dispose;
    if (typeof prevDispose === "function") prevDispose();
    const handle = hydrateTemplate(template, marker.el, { mismatch: "warn-remount" });

    const wrappedDispose = () => {
      handle.unmount();
      _islandDisposes.delete(wrappedDispose);
      delete (marker.el as any).__nix_js_island_dispose;
    };
    (marker.el as any).__nix_js_island_dispose = wrappedDispose;
    _islandDisposes.add(wrappedDispose);
  } catch (error) {
    reportIslandError(marker, error);
  }
}

function reportIslandError(marker: IslandMarker, error: unknown): void {
  console.error(`[nix-js-kit] Failed to hydrate island "${marker.name}":`, error);
  const EventConstructor = marker.el.ownerDocument.defaultView?.CustomEvent;
  if (EventConstructor) {
    marker.el.dispatchEvent(new EventConstructor("nix-js:island-error", {
      bubbles: true,
      detail: { name: marker.name, error },
    }));
  }
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
  for (const cancel of _islandSchedules) cancel();
  _islandSchedules.clear();
  for (const dispose of _islandDisposes) dispose();
  _islandDisposes.clear();
}

export function hydrateIslands(registry: IslandRegistry): void {
  if (typeof window === "undefined") return;

  const markers = collectMarkers();

  for (const marker of markers) {
    if (marker.directive === "load") {
      void hydrate(marker, registry);
      continue;
    }

    if (marker.directive === "idle") {
      let cancel = () => { };
      if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(() => {
          _islandSchedules.delete(cancel);
          void hydrate(marker, registry);
        });
        cancel = () => window.cancelIdleCallback(id);
      } else {
        const id = globalThis.setTimeout(() => {
          _islandSchedules.delete(cancel);
          void hydrate(marker, registry);
        }, 0);
        cancel = () => globalThis.clearTimeout(id);
      }
      _islandSchedules.add(cancel);
      continue;
    }

    if (marker.directive === "visible") {
      if ("IntersectionObserver" in window) {
        let cancel = () => { };
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                _islandSchedules.delete(cancel);
                observer.disconnect();
                void hydrate(marker, registry);
              }
            }
          },
          { rootMargin: "0px", threshold: 0 },
        );
        cancel = () => observer.disconnect();
        _islandSchedules.add(cancel);
        observer.observe(marker.el);
      } else {
        void hydrate(marker, registry);
      }
    }
  }
}
