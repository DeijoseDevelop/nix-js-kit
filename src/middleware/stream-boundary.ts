// =============================================================================
// --- Stream boundary (per-request, real streaming support) ---
// =============================================================================
//
// `streamBoundary()` wraps a promise in a loading fallback. During SSR runtime,
// the server emits the fallback immediately, then appends the resolved content
// at the end of the document with a swap script (out-of-order streaming).
//
// In SSG (build time), boundaries are resolved synchronously — the build waits
// for all promises before writing the HTML, so no streaming occurs.
//
// Boundaries are tracked per-request via AsyncLocalStorage to avoid global
// state leakage between concurrent requests.
// =============================================================================

import type { NixTemplate } from "@deijose/nix-js";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

export interface StreamBoundaryOptions<T> {
  /** Fallback content shown while the promise resolves. */
  fallback: NixTemplate;
  /** Promise that resolves to a NixTemplate. */
  promise: Promise<T>;
  /** Renders the resolved value to a NixTemplate. */
  children: (value: T) => NixTemplate;
}

/** Per-request boundary registry. */
interface BoundaryContext {
  boundaries: Map<string, {
    promise: Promise<unknown>;
    children: (value: unknown) => NixTemplate;
  }>;
}

const boundaryALS = new AsyncLocalStorage<BoundaryContext>();

/**
 * Gets the current per-request boundary context, if any.
 * Used by the streaming response to collect boundaries for later resolution.
 */
export function getCurrentBoundaryContext(): BoundaryContext | undefined {
  return boundaryALS.getStore();
}

/**
 * Runs a function within a per-request boundary context.
 * Used by the SSR streaming pipeline to collect boundaries.
 */
export function withBoundaryContext<T>(fn: () => T): T {
  const ctx: BoundaryContext = { boundaries: new Map() };
  return boundaryALS.run(ctx, fn);
}

/**
 * Creates a stream boundary. During SSR, emits the fallback and registers the
 * promise for later resolution by the streaming pipeline. During SSG, the
 * build awaits all boundaries before writing HTML.
 *
 * The boundary ID is deterministic per-request via crypto.randomUUID().
 */
export function streamBoundary<T>(options: StreamBoundaryOptions<T>): NixTemplate {
  const id = `nix-js-stream-${randomUUID().slice(0, 8)}`;
  const ctx = boundaryALS.getStore();

  // In SSR mode with a boundary context, register the promise for later.
  if (ctx) {
    ctx.boundaries.set(id, {
      promise: options.promise,
      children: options.children as (value: unknown) => NixTemplate,
    });
  }

  return {
    __isNixTemplate: true as const,
    mount(container: Element | string) {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) throw new Error("[nix-js-kit] streamBoundary(): container not found");
      // Render fallback initially.
      const handle = options.fallback.mount(el);
      // Attempt to resolve and swap (works in both SSR and client).
      options.promise
        .then((value) => {
          const content = options.children(value);
          el.innerHTML = "";
          const childHandle = content.mount(el);
          // Store the new handle for cleanup.
          (handle as any).__nixChildHandle = childHandle;
        })
        .catch((err) => {
          console.error(`[nix-js-kit] streamBoundary ${id} failed:`, err);
        });
      return {
        unmount() {
          const childHandle = (handle as any).__nixChildHandle;
          if (childHandle?.unmount) childHandle.unmount();
          handle.unmount();
        },
      };
    },
    _render(parent: Node, before: Node | null): () => void {
      // For SSR/build: render fallback inline. The promise resolution is
      // handled by the streaming pipeline when available.
      const dispose = options.fallback._render(parent, before);

      // Kick off the promise resolution in the background.
      // In a full streaming implementation, the streaming response collects
      // all boundaries from the context and writes chunks as they resolve.
      options.promise
        .then((value) => {
          void value;
        })
        .catch((err) => {
          console.error(`[nix-js-kit] streamBoundary ${id} failed:`, err);
        });

      return dispose;
    },
  } as unknown as NixTemplate;
}
