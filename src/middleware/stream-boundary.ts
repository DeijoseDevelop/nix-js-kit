// =============================================================================
// --- Stream boundary (experimental) ---
// =============================================================================
//
// `streamBoundary()` wraps a promise in a loading fallback. During SSR runtime,
// the server emits the fallback immediately, then appends the resolved content
// at the end of the document with a swap script (out-of-order streaming).
//
// In SSG (build time), boundaries are resolved synchronously — the build waits
// for all promises before writing the HTML, so no streaming occurs.
//
// This is experimental: it only works with the SSR runtime server, not with
// SSG builds. The API may change.
// =============================================================================

import type { NixTemplate } from "@deijose/nix-js";

export interface StreamBoundaryOptions<T> {
  /** Fallback content shown while the promise resolves. */
  fallback: NixTemplate;
  /** Promise that resolves to a NixTemplate. */
  promise: Promise<T>;
  /** Renders the resolved value to a NixTemplate. */
  children: (value: T) => NixTemplate;
}

let boundaryCounter = 0;

/**
 * Creates a stream boundary. During SSR, emits the fallback and queues the
 * promise for later resolution. During SSG, awaits the promise and renders
 * the result inline.
 *
 * **Experimental:** only works with the SSR runtime server.
 */
export function streamBoundary<T>(options: StreamBoundaryOptions<T>): NixTemplate {
  const id = `nix-js-stream-${++boundaryCounter}`;

  // In SSR mode, we emit the fallback and register the promise for later.
  // The actual streaming logic is handled by the SSR server's streaming
  // pipeline (see ssr/stream.ts).
  //
  // For now, this is a placeholder that renders the fallback. The full
  // out-of-order streaming implementation will be added in a future version
  // once the SSR server's response pipeline supports chunked writes.
  //
  // In SSG mode, the build should await all boundaries before writing HTML.
  // That logic lives in the build orchestrator.

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
      options.promise
        .then((value) => {
          // In a full streaming implementation, this would write a chunk
          // to the response stream. For now, we just log.
          void value;
        })
        .catch((err) => {
          console.error(`[nix-js-kit] streamBoundary ${id} failed:`, err);
        });

      return dispose;
    },
  } as unknown as NixTemplate;
}
