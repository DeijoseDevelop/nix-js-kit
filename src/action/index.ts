/**
 * Client-side helper for invoking server actions.
 *
 * Server actions are defined in `page.action.ts` files next to `page.ts`.
 * They export async functions that run on the server. On the client, call them
 * by name using `callAction`:
 *
 * ```ts
 * import { callAction } from "@deijose/nix-js-kit/action";
 *
 * const result = await callAction("submitContact", { name: "Ada" });
 * ```
 */

export interface ActionRequest {
  name: string;
  args: unknown[];
}

/**
 * Call a server action by name.
 *
 * The request is sent as a POST to `/__nix-js/actions` with the action name and
 * serialized arguments. The server executes the matching exported function
 * from the scanned `page.action.ts` modules and returns its JSON result.
 */
export async function callAction<T = unknown>(
  name: string,
  ...args: unknown[]
): Promise<T> {
  const res = await fetch("/__nix-js/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, args } as ActionRequest),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Action "${name}" failed: ${text}`);
  }

  return res.json() as Promise<T>;
}
