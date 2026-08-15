// =============================================================================
// --- Ephemeral action error store ---
// =============================================================================
//
// Action failures submitted via plain HTML forms (progressive enhancement)
// need to be relayed back to the page so the user sees validation errors.
//
// Previously the failure data was serialized into a `?__nix_js_action_error=`
// query param on the redirect. That leaks errors into browser history,
// server logs and third-party Referer headers.
//
// Now we stash the failure in a short-lived in-memory store keyed by a random
// id, set a small cookie `__nix_js_action_error=<id>` (Max-Age=15s, SameSite=Lax),
// and the next render reads the cookie, fetches the payload, exposes it as
// `props.form`, and clears the entry.
//
// The store is process-local, which is fine for the single-process SSR server
// and the dev server. For multi-instance deployments the cookie carries the
// payload directly when it fits (see `encodeActionErrorCookie`); the store is
// only the overflow path for large payloads.
// =============================================================================

import { randomBytes } from "node:crypto";

const COOKIE_NAME = "__nix_js_action_error";
const MAX_COOKIE_SIZE = 3500; // bytes; leaves headroom under the 4KB cookie limit
const TTL_MS = 15_000;

interface StoredError {
  data: unknown;
  status: number;
  expiresAt: number;
}

const store = new Map<string, StoredError>();

// Periodically purge expired entries so the map does not grow unbounded.
let sweepScheduled = false;
function scheduleSweep(): void {
  if (sweepScheduled) return;
  sweepScheduled = true;
  setTimeout(() => {
    sweepScheduled = false;
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) store.delete(key);
    }
  }, TTL_MS).unref?.();
}

/**
 * Encodes an action failure for the redirect cookie. When the payload fits
 * inside the cookie limit, it is embedded directly as base64url JSON. When it
 * is too large, it is stored in memory and only a short id is written to the
 * cookie.
 *
 * @returns The cookie value to set on the redirect response.
 */
export function encodeActionErrorCookie(
  data: unknown,
  status: number,
): { value: string; storeId?: string } {
  const payload = JSON.stringify({ d: data, s: status });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  if (encoded.length <= MAX_COOKIE_SIZE) {
    return { value: encoded };
  }

  // Overflow: stash in memory and reference by id.
  const id = randomBytes(12).toString("hex");
  store.set(id, { data, status, expiresAt: Date.now() + TTL_MS });
  scheduleSweep();
  return { value: `id:${id}`, storeId: id };
}

/**
 * Decodes a cookie value (previously produced by `encodeActionErrorCookie`)
 * into the failure payload. Resolves in-memory overflow entries and deletes
 * them after reading.
 */
export function decodeActionErrorCookie(value: string | undefined | null):
  | { data: unknown; status: number }
  | undefined {
  if (!value) return undefined;

  if (value.startsWith("id:")) {
    const id = value.slice(3);
    const entry = store.get(id);
    if (!entry) return undefined;
    store.delete(id);
    if (entry.expiresAt <= Date.now()) return undefined;
    return { data: entry.data, status: entry.status };
  }

  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { d: unknown; s: number };
    return { data: parsed.d, status: parsed.s };
  } catch {
    return undefined;
  }
}

/** Name of the cookie used to relay action errors. */
export const ACTION_ERROR_COOKIE = COOKIE_NAME;

/** Builds the Set-Cookie header value that clears the error cookie. */
export function clearActionErrorCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Builds the Set-Cookie header value that sets the error cookie. */
export function setActionErrorCookieHeader(value: string): string {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=15; SameSite=Lax; HttpOnly`;
}
