import type { ActionRequest } from "./index";

/**
 * Resolves a server action by name and optional page scope.
 */
export type ActionResolver = (
  name: string,
  page?: string,
) => Promise<((...args: unknown[]) => unknown) | undefined>;

function parseFormBody(body: string): Record<string, unknown> {
  const params = new URLSearchParams(body);
  const result: Record<string, unknown> = {};
  for (const [key, value] of params) {
    if (result[key] === undefined) {
      result[key] = value;
    } else if (Array.isArray(result[key])) {
      (result[key] as unknown[]).push(value);
    } else {
      result[key] = [result[key], value];
    }
  }
  return result;
}

async function parseActionRequest(request: Request): Promise<
  | { ok: true; name: string; page?: string; args: unknown[]; wantsJson: boolean }
  | { ok: false; response: Response }
> {
  if (request.method !== "POST") {
    return {
      ok: false,
      response: new Response("Method not allowed", {
        status: 405,
        headers: { "Content-Type": "text/plain" },
      }),
    };
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  const wantsJson = (request.headers.get("Accept") ?? "").includes("application/json");

  let name: string | undefined;
  let page: string | undefined;
  let args: unknown[] = [];

  if (contentType.includes("application/json")) {
    let body: ActionRequest;
    try {
      body = (await request.json()) as ActionRequest;
    } catch {
      return {
        ok: false,
        response: new Response("Invalid JSON body", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        }),
      };
    }
    name = body.name;
    page = body.page;
    args = Array.isArray(body.args) ? body.args : [];
  } else if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    name = form.get("__nix_action_name") as string | null ?? undefined;
    page = form.get("__nix_action_page") as string | null ?? undefined;
    const input: Record<string, unknown> = {};
    for (const [key, value] of form) {
      if (key === "__nix_action_name" || key === "__nix_action_page") continue;
      input[key] = value;
    }
    args = [input];
  } else {
    // Try to parse a plain form body as a fallback for progressive enhancement.
    const text = await request.text();
    const form = parseFormBody(text);
    name = form.__nix_action_name as string | undefined;
    page = form.__nix_action_page as string | undefined;
    const input: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(form)) {
      if (key === "__nix_action_name" || key === "__nix_action_page") continue;
      input[key] = value;
    }
    args = [input];
  }

  if (!name || typeof name !== "string") {
    return {
      ok: false,
      response: new Response("Missing action name", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      }),
    };
  }

  return { ok: true, name, page, args, wantsJson };
}

/**
 * Handles a POST request to the server action endpoint.
 *
 * Accepts both JSON requests (`{ name, page?, args }`) and HTML form submissions
 * for progressive enhancement. The provided resolver looks up the action
 * implementation, invokes it with the supplied arguments and returns the result
 * as JSON or redirects back to the request origin for form submissions.
 */
export async function handleActionRequest(
  request: Request,
  resolveAction: ActionResolver,
): Promise<Response> {
  const parsed = await parseActionRequest(request);
  if (!parsed.ok) return parsed.response;

  const { name, page, args, wantsJson } = parsed;

  try {
    const action = await resolveAction(name, page);
    if (!action) {
      const message = page ? `Action not found: ${name} (page: ${page})` : `Action not found: ${name}`;
      return new Response(message, {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const result = await action(...args);

    if (wantsJson) {
      return new Response(JSON.stringify(result ?? null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // For progressive enhancement (plain form POST), redirect back.
    const referer = request.headers.get("Referer") ?? "/";
    return new Response(null, {
      status: 303,
      headers: {
        Location: typeof result === "string" ? result : referer,
        "Content-Type": "text/plain",
      },
    });
  } catch (err) {
    console.error("[nix-js-kit] Action error:", err);
    return new Response(String(err), {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
