import type { ApiRoute, PageRoute } from "../router/route-scanner.js";

export interface MatchResult {
  route: PageRoute;
  params: Record<string, string | string[]>;
  searchParams: URLSearchParams;
}

/**
 * Match a request pathname against a list of page routes.
 *
 * Routes are sorted by specificity (static > dynamic > catch-all) before
 * matching, so `/about` wins over `/:slug` even if the catch-all appears first.
 *
 * URL segments are safely decoded (plan §11.1, runtime-security §10).
 */
export function matchRoute(
  pathname: string,
  routes: PageRoute[],
): MatchResult | undefined {
  const cleanPath = pathname.split("?")[0];
  const requestSegments = cleanPath.split("/").filter(Boolean).map(safeDecodeURIComponent);

  const sorted = [...routes].sort((a, b) => specificity(b.path) - specificity(a.path));

  for (const route of sorted) {
    const routeSegments = route.path.split("/").filter(Boolean);
    const match = tryMatch(requestSegments, routeSegments, route.optionalCatchAll);
    if (match) {
      return { route, params: match, searchParams: new URLSearchParams() };
    }
  }

  return undefined;
}

export interface ApiMatchResult<T = ApiRoute> {
  route: T;
  params: Record<string, string | string[]>;
}

/**
 * Match a request pathname against a list of API routes.
 */
export function matchApiRoute<T extends { path: string }>(pathname: string, routes: T[]): ApiMatchResult<T> | undefined {
  const cleanPath = pathname.split("?")[0];
  const requestSegments = cleanPath.split("/").filter(Boolean).map(safeDecodeURIComponent);

  const sorted = [...routes].sort((a, b) => specificity(b.path) - specificity(a.path));

  for (const route of sorted) {
    const routeSegments = route.path.split("/").filter(Boolean);
    const match = tryMatch(requestSegments, routeSegments);
    if (match) {
      return { route, params: match };
    }
  }

  return undefined;
}

/**
 * Safely decodes a URI component. If decoding fails (malformed % sequences),
 * returns the original string rather than throwing (runtime-security §10).
 */
function safeDecodeURIComponent(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function specificity(path: string): number {
  return path.split("/").filter(Boolean).reduce((score, segment) => {
    if (segment.endsWith("*")) return score;
    if (segment.startsWith(":")) return score + 1;
    return score + 2;
  }, 0);
}

function tryMatch(
  requestSegments: string[],
  routeSegments: string[],
  optionalCatchAll = false,
): Record<string, string | string[]> | undefined {
  const params: Record<string, string | string[]> = {};

  let i = 0;
  for (let r = 0; r < routeSegments.length; r++) {
    const routeSeg = routeSegments[r];

    if (routeSeg.endsWith("*")) {
      // Catch-all consumes the rest of the request segments.
      const name = routeSeg.slice(1, -1);
      const rest = requestSegments.slice(i);
      // For optional catch-all, empty rest is OK.
      if (rest.length === 0 && !optionalCatchAll) return undefined;
      params[name] = rest.length > 0 ? rest : [];
      return params;
    }

    if (routeSeg.startsWith(":")) {
      const requestSeg = requestSegments[i];
      if (requestSeg === undefined) return undefined;
      params[routeSeg.slice(1)] = requestSeg;
      i++;
      continue;
    }

    if (routeSeg !== requestSegments[i]) {
      return undefined;
    }
    i++;
  }

  if (i !== requestSegments.length) return undefined;
  return params;
}
