import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  registerIntegration,
  getI18nIntegration,
  getAuthIntegration,
  getQueryIntegration,
  getTestingIntegration,
  getCustomIntegrations,
  clearIntegrations,
} from "../src/integrations/hooks.ts";

beforeEach(() => {
  clearIntegrations();
});

describe("integration hooks (plan §11.6)", () => {
  it("registers and retrieves i18n integration", () => {
    registerIntegration("i18n", {
      getLocale: () => "en",
      getAlternates: (url) => [{ hreflang: "en", href: url.toString() }],
      translate: (key) => key,
    });

    const i18n = getI18nIntegration();
    assert.ok(i18n);
    assert.equal(i18n!.getLocale(new Request("http://localhost/")), "en");
    assert.equal(i18n!.translate("hello", "en"), "hello");
  });

  it("registers and retrieves auth integration", async () => {
    registerIntegration("auth", {
      getSession: async () => ({ user: { id: 1 } }),
      seedSSR: (locals) => ({ ...locals, auth: true }),
    });

    const auth = getAuthIntegration();
    assert.ok(auth);
    const session = await auth!.getSession(new Request("http://localhost/"));
    assert.deepEqual(session, { user: { id: 1 } });
    assert.deepEqual(auth!.seedSSR({}), { auth: true });
  });

  it("registers and retrieves query integration", () => {
    registerIntegration("query", {
      dehydrate: () => ({ queries: {} }),
      rehydrate: () => {},
      invalidate: () => {},
    });

    const query = getQueryIntegration();
    assert.ok(query);
    assert.deepEqual(query!.dehydrate(), { queries: {} });
  });

  it("registers and retrieves testing integration", () => {
    registerIntegration("testing", {
      createRequest: (method, path) => new Request(`http://localhost${path}`, { method }),
      createRenderFixture: (route) => ({ route }),
      reset: () => {},
    });

    const testing = getTestingIntegration();
    assert.ok(testing);
    const req = testing!.createRequest("GET", "/test");
    assert.equal(req.method, "GET");
    assert.equal(req.url, "http://localhost/test");
  });

  it("registers and retrieves custom integrations", () => {
    registerIntegration("custom", {
      name: "my-integration",
      config: () => {},
    });

    const customs = getCustomIntegrations();
    assert.equal(customs.length, 1);
    assert.equal(customs[0]!.name, "my-integration");
  });

  it("returns undefined for unregistered integrations", () => {
    assert.equal(getI18nIntegration(), undefined);
    assert.equal(getAuthIntegration(), undefined);
    assert.equal(getQueryIntegration(), undefined);
    assert.equal(getTestingIntegration(), undefined);
    assert.equal(getCustomIntegrations().length, 0);
  });

  it("clearIntegrations removes all registrations", () => {
    registerIntegration("i18n", {
      getLocale: () => "en",
      getAlternates: () => [],
      translate: (k) => k,
    });
    registerIntegration("custom", { name: "test" });

    clearIntegrations();

    assert.equal(getI18nIntegration(), undefined);
    assert.equal(getCustomIntegrations().length, 0);
  });
});
