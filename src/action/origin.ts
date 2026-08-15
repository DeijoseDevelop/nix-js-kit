// =============================================================================
// --- Origin verification (CSRF protection for server actions) ---
// =============================================================================
//
// Server actions accept POST requests from the browser. Without origin
// verification, any third-party site could submit forged requests to
// `/__nix-js/actions` on behalf of a logged-in user (CSRF).
//
// Strategy: compare the request's `Origin` (or `Referer` fallback) host against
// the target `Host` header. Same-origin requests pass; cross-origin requests
// are rejected with 403 unless the origin is explicitly allow-listed.
//
// Requests without `Origin` AND without `Referer` (e.g. curl, server-to-server)
// are accepted by default for DX, unless `strictOrigin: true` is configured.
// =============================================================================

export interface OriginCheckOptions {
  /** Extra origins allowed to call actions (e.g. preview deployments). */
  allowedOrigins?: string[];
  /**
   * When true, requests missing both `Origin` and `Referer` are rejected.
   * Defaults to false so curl/server-to-server calls keep working.
   */
  strictOrigin?: boolean;
}

/**
 * Returns the host:port of a URL string, or undefined if it cannot be parsed.
 */
function hostOf(urlString: string | null | undefined): string | undefined {
  if (!urlString) return undefined;
  try {
    return new URL(urlString, "http://placeholder.invalid").host;
  } catch {
    return undefined;
  }
}

/**
 * Verifies that a request originates from the same host (or an allow-listed
 * origin). Returns an error message when the request must be rejected, or
 * undefined when it is allowed.
 *
 * @param request The incoming Request to actions.
 * @param options Origin check configuration.
 */
export function verifyOrigin(
  request: Request,
  options: OriginCheckOptions = {},
): string | undefined {
  const targetHost = request.headers.get("Host") ?? hostOf(request.url);
  if (!targetHost) {
    // No way to verify; let the caller decide. We reject to be safe.
    return "Missing Host header";
  }

  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  const sourceHost = hostOf(origin) ?? hostOf(referer);

  if (!sourceHost) {
    // No Origin and no Referer: same-origin legacy browsers or non-browser.
    return options.strictOrigin
      ? "Missing Origin and Referer headers"
      : undefined;
  }

  if (sourceHost === targetHost) return undefined;

  if (options.allowedOrigins) {
    const sourceOrigin = origin ?? `${sourceHost}`;
    for (const allowed of options.allowedOrigins) {
      const allowedHost = hostOf(allowed) ?? allowed;
      if (sourceHost === allowedHost) return undefined;
      if (sourceOrigin === allowed) return undefined;
    }
  }

  return `Cross-origin request blocked: source "${sourceHost}" != target "${targetHost}"`;
}

/** Builds a 403 Response for a rejected origin. */
export function originForbidden(message: string): Response {
  return new Response(message, {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
