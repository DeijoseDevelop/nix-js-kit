import type { ActionRequest } from "./index";

/**
 * Resolves a server action by name.
 */
export type ActionResolver = (
  name: string,
) => Promise<((...args: unknown[]) => unknown) | undefined>;

/**
 * Handles a POST request to the server action endpoint.
 *
 * The request body must be a JSON object `{ name: string, args: unknown[] }`.
 * The provided resolver looks up the action implementation, invokes it with
 * the supplied arguments and returns the JSON-serialized result.
 */
export async function handleActionRequest(
  request: Request,
  resolveAction: ActionResolver,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let body: ActionRequest;
  try {
    body = (await request.json()) as ActionRequest;
  } catch {
    return new Response("Invalid JSON body", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const { name, args } = body;
  if (!name || typeof name !== "string") {
    return new Response("Missing action name", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  try {
    const action = await resolveAction(name);
    if (!action) {
      return new Response(`Action not found: ${name}`, {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const result = await action(...(args ?? []));
    return new Response(JSON.stringify(result ?? null), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[nix-js-kit] Action error:", err);
    return new Response(String(err), {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
