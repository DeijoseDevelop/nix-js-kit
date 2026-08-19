import type { IncomingMessage } from "node:http";

// Capture the global AbortController at module load time so it's immune to
// test frameworks that replace or delete globalThis.AbortController.
const GlobalAbortController =
  (globalThis as { AbortController?: typeof AbortController }).AbortController ?? AbortController;

export function incomingMessageToRequest(req: IncomingMessage, body?: BodyInit | null): Request {
  const headers = new Headers();
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    headers.append(req.rawHeaders[index], req.rawHeaders[index + 1]);
  }

  const controller = new GlobalAbortController();
  req.once("aborted", () => controller.abort());
  req.once("close", () => {
    if (!req.complete) controller.abort();
  });

  const protocol = (req.socket as typeof req.socket & { encrypted?: boolean }).encrypted ? "https" : "http";
  const init: RequestInit = {
    method: req.method ?? "GET",
    headers,
    signal: controller.signal,
  };
  if (body !== undefined && body !== null && init.method !== "GET" && init.method !== "HEAD") init.body = body;

  return new Request(`${protocol}://${headers.get("host") ?? "localhost"}${req.url ?? "/"}`, init);
}
