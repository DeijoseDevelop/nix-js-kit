import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanActions } from "../src/action/scan.ts";
import { handleActionRequest } from "../src/action/server.ts";
import { fail, redirect } from "../src/errors.ts";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, "fixtures/minimal/src/app");

describe("scanActions", () => {
  it("groups actions by page path", async () => {
    const actions = await scanActions(appDir);
    assert.equal(actions["/"].greet, resolve(appDir, "page.action.ts"));
    assert.equal(actions["/"].subscribe, resolve(appDir, "page.action.ts"));
  });
});

describe("handleActionRequest", () => {
  async function resolveAction(name: string, page?: string) {
    const actions = await scanActions(appDir);
    const actionPath = page ? actions[page]?.[name] : Object.values(actions).find((p) => p[name])?.[name];
    if (!actionPath) return undefined;
    const mod = await import(actionPath);
    return mod[name] as (...args: unknown[]) => unknown;
  }

  it("executes a JSON action with page scope", async () => {
    const request = new Request("http://localhost/__nix-js/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "greet", page: "/", args: ["Ada"] }),
    });
    const response = await handleActionRequest(request, resolveAction);
    assert.equal(response.status, 200);
    assert.equal(await response.json(), "Hello, Ada!");
  });

  it("executes a JSON action with object args", async () => {
    const request = new Request("http://localhost/__nix-js/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "subscribe", page: "/", args: [{ email: "ada@example.com" }] }),
    });
    const response = await handleActionRequest(request, resolveAction);
    assert.equal(response.status, 200);
    assert.equal(await response.json(), "Subscribed: ada@example.com");
  });

  it("returns a redirect for form POSTs", async () => {
    const request = new Request("http://localhost/__nix-js/actions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: "http://localhost/" },
      body: new URLSearchParams({
        __nix_action_name: "subscribe",
        __nix_action_page: "/",
        email: "ada@example.com",
      }).toString(),
    });
    const response = await handleActionRequest(request, resolveAction);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("Location"), "Subscribed: ada@example.com");
  });

  it("returns a JSON ActionFailure payload", async () => {
    const badAction = async () => fail(400, { field: "email", message: "Invalid email" });
    const request = new Request("http://localhost/__nix-js/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "bad", args: [] }),
    });
    const response = await handleActionRequest(request, async () => badAction);
    assert.equal(response.status, 400);
    const body = (await response.json()) as { __nix_action_failure: boolean; status: number; data: unknown };
    assert.equal(body.__nix_action_failure, true);
    assert.equal(body.status, 400);
    assert.deepEqual(body.data, { field: "email", message: "Invalid email" });
  });

  it("redirects with ActionFailure data for form POSTs", async () => {
    const badAction = async () => fail(400, { field: "email", message: "Invalid email" });
    const request = new Request("http://localhost/__nix-js/actions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: "http://localhost/contact" },
      body: new URLSearchParams({ __nix_action_name: "bad", __nix_action_page: "/" }).toString(),
    });
    const response = await handleActionRequest(request, async () => badAction);
    assert.equal(response.status, 303);
    const location = response.headers.get("Location");
    assert.ok(location?.startsWith("/contact?__nix_action_error="), "should redirect back with error query");
  });

  it("returns a JSON redirect payload for JSON requests", async () => {
    const redirectAction = async () => redirect(303, "/login");
    const request = new Request("http://localhost/__nix-js/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "redirect", args: [] }),
    });
    const response = await handleActionRequest(request, async () => redirectAction);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { __nix_action_redirect: boolean; status: number; location: string };
    assert.equal(body.__nix_action_redirect, true);
    assert.equal(body.status, 303);
    assert.equal(body.location, "/login");
  });

  it("returns an HTTP redirect for form POSTs", async () => {
    const redirectAction = async () => redirect(303, "/login");
    const request = new Request("http://localhost/__nix-js/actions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: "http://localhost/" },
      body: new URLSearchParams({ __nix_action_name: "redirect", __nix_action_page: "/" }).toString(),
    });
    const response = await handleActionRequest(request, async () => redirectAction);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("Location"), "/login");
  });
});
