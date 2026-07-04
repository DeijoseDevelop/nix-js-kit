/**
 * Represents a failed action result. Returned by `fail()` from server actions.
 */
export class ActionFailure<TData = unknown> {
  constructor(
    public status: number,
    public data: TData,
  ) {}
}

/**
 * Represents a redirect returned by a server action. Returned by `redirect()`.
 */
export class RedirectResponse {
  constructor(
    public status: number,
    public location: string,
  ) {}
}

/**
 * Helper to return a validation/error response from a server action.
 *
 * ```ts
 * export async function login(input: { email: string }) {
 *   if (!input.email.includes("@")) {
 *     return fail(400, { email: input.email, error: "Invalid email" });
 *   }
 *   return { ok: true };
 * }
 * ```
 */
export function fail<TData>(status: number, data: TData): ActionFailure<TData> {
  return new ActionFailure(status, data);
}

/**
 * Helper to return a redirect from a server action.
 *
 * ```ts
 * export async function logout() {
 *   return redirect(303, "/login");
 * }
 * ```
 */
export function redirect(status: number, location: string): RedirectResponse {
  return new RedirectResponse(status, location);
}

/**
 * Type guard for action failures.
 */
export function isActionFailure(value: unknown): value is ActionFailure {
  return value instanceof ActionFailure;
}

/**
 * Type guard for redirects.
 */
export function isRedirectResponse(value: unknown): value is RedirectResponse {
  return value instanceof RedirectResponse;
}
