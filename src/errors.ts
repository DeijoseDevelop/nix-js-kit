/**
 * Represents a failed action result. Returned by `fail()` from server actions.
 *
 * The `__nix_action_failure` marker is set on the instance so the server can
 * detect it even when the value crosses a bundling boundary (e.g. the CLI is
 * bundled separately from the user's action modules).
 */
export class ActionFailure<TData = unknown> {
  readonly __nix_action_failure = true;
  constructor(
    public status: number,
    public data: TData,
  ) {}
}

/**
 * Represents a redirect returned by a server action. Returned by `redirect()`.
 */
export class RedirectResponse {
  readonly __nix_action_redirect = true;
  constructor(
    public status: number,
    public location: string,
  ) {}
}

/**
 * Helper to return a validation/error response from a server action.
 *
 * Both argument orders are accepted:
 *
 * ```ts
 * return fail(400, { email: "Invalid email" });
 * return fail({ email: "Invalid email" }, 400);
 * return fail({ email: "Invalid email" }); // defaults to status 400
 * ```
 */
export function fail<TData>(
  statusOrData: number | TData,
  dataOrStatus?: TData | number,
): ActionFailure<unknown> {
  if (typeof statusOrData === "number") {
    return new ActionFailure(statusOrData, dataOrStatus as TData);
  }
  return new ActionFailure((dataOrStatus as number) ?? 400, statusOrData);
}

/**
 * Helper to return a redirect from a server action.
 *
 * Both argument orders are accepted:
 *
 * ```ts
 * return redirect(303, "/login");
 * return redirect("/login"); // defaults to status 303
 * ```
 */
export function redirect(
  statusOrLocation: number | string,
  locationOrStatus?: string | number,
): RedirectResponse {
  if (typeof statusOrLocation === "number") {
    return new RedirectResponse(statusOrLocation, locationOrStatus as string);
  }
  return new RedirectResponse((locationOrStatus as number) ?? 303, statusOrLocation);
}

/**
 * Type guard for action failures. Uses the marker field so it works across
 * bundling boundaries where `instanceof` fails.
 */
export function isActionFailure(value: unknown): value is ActionFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __nix_action_failure?: unknown }).__nix_action_failure === true
  );
}

/**
 * Type guard for redirects. Uses the marker field so it works across bundling
 * boundaries where `instanceof` fails.
 */
export function isRedirectResponse(value: unknown): value is RedirectResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __nix_action_redirect?: unknown }).__nix_action_redirect === true
  );
}
