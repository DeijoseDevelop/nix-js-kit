// =============================================================================
// --- Middleware ---
// =============================================================================
//
// Convention: `src/middleware.ts` in the project root exports a default
// function and an optional `config` with a `matcher` array.
//
//   import type { Middleware } from "@deijose/nix-js-kit";
//
//   export default function middleware(request: Request) {
//     if (!request.headers.get("Cookie")?.includes("session=")) {
//       return Response.redirect(new URL("/login", request.url), 307);
//     }
//   }
//
//   export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };
//
// The middleware runs before routing. Return a `Response` to short-circuit
// (redirect, rewrite, 401, etc.). Return `undefined` or nothing to continue.
// Use `next()` to pass headers to the loader.
// =============================================================================

import { matchRoute } from "../ssr/match.js";
import type { PageRoute } from "../router/route-scanner.js";

/** The middleware function signature. */
export type Middleware = (request: Request, context: MiddlewareContext) =>
  | Response
  | void
  | Promise<Response | void>;

/** Context passed to the middleware function. */
export interface MiddlewareContext {
  /** Helper to continue to the next handler. Can attach headers. */
  next(options?: { headers?: Record<string, string> }): void;
  /** Matched route params (only available if the path matches a page route). */
  params?: Record<string, string | string[]>;
}

/** Configuration for the middleware module. */
export interface MiddlewareConfig {
  /** Path patterns that trigger the middleware. Supports `:param` and `:param*`. */
  matcher?: string[];
}

export interface LoadedMiddleware {
  handler: Middleware;
  config: MiddlewareConfig;
}

/** Result of running middleware: either a response to short-circuit with, or continue. */
export type MiddlewareResult =
  | { kind: "response"; response: Response }
  | { kind: "continue"; headers?: Record<string, string> };

/**
 * Loads the user's `src/middleware.ts` module. Returns `null` if no middleware
 * file exists.
 */
export async function loadMiddleware(root: string): Promise<LoadedMiddleware | null> {
  const candidates = [
    `${root}/src/middleware.ts`,
    `${root}/middleware.ts`,
  ];

  for (const path of candidates) {
    try {
      const mod = await import(path);
      const handler = (mod.default ?? mod.middleware) as Middleware | undefined;
      if (typeof handler !== "function") continue;
      const config = (mod.config ?? {}) as MiddlewareConfig;
      return { handler, config };
    } catch {
      // File doesn't exist or has errors — try next candidate.
    }
  }

  return null;
}

/**
 * Checks if a pathname matches any of the middleware's matcher patterns.
 * If no matcher is configured, the middleware runs for every request.
 *
 * Catch-all patterns (`:param*`) match both the base path and any sub-paths,
 * e.g. `/dashboard/:path*` matches `/dashboard` and `/dashboard/settings/users`.
 */
export function matchesMiddleware(pathname: string, config: MiddlewareConfig): boolean {
  if (!config.matcher || config.matcher.length === 0) return true;

  const cleanPath = pathname.split("?")[0];

  for (const pattern of config.matcher) {
    // Exact match.
    if (pattern === cleanPath) return true;

    // Check for catch-all: `/foo/:bar*` should also match `/foo`.
    const catchAllMatch = pattern.match(/^(.*)\/:[\w]+\*$/);
    if (catchAllMatch) {
      const base = catchAllMatch[1];
      if (cleanPath === base) return true;
    }

    // Use matchRoute for param matching.
    const pseudoRoutes: PageRoute[] = [{
      path: pattern,
      pagePath: "",
      params: [],
      layouts: [],
    }];
    if (matchRoute(cleanPath, pseudoRoutes)) return true;
  }

  return false;
}

/**
 * Runs the middleware for a request. Returns the result indicating whether to
 * short-circuit with a response or continue.
 */
export async function runMiddleware(
  middleware: LoadedMiddleware,
  request: Request,
  params?: Record<string, string | string[]>,
): Promise<MiddlewareResult> {
  let nextHeaders: Record<string, string> | undefined;

  const context: MiddlewareContext = {
    next(options) {
      if (options?.headers) nextHeaders = options.headers;
    },
    params,
  };

  const result = await middleware.handler(request, context);

  if (result instanceof Response) {
    return { kind: "response", response: result };
  }

  return { kind: "continue", headers: nextHeaders };
}
