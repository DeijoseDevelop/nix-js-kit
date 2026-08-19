export interface NixKitIntegrationContext {
  root: string;
  command: "dev" | "build" | "preview" | "start" | "check" | "routes" | "doctor";
}

export interface NixKitIntegration {
  name: string;
  config?(config: Record<string, unknown>, context: NixKitIntegrationContext): void | Promise<void>;
  routes?(manifest: unknown, context: NixKitIntegrationContext): void | Promise<void>;
  request?(request: Request, context: NixKitIntegrationContext): void | Response | Promise<void | Response>;
  render?(result: { html: string }, context: NixKitIntegrationContext): void | Promise<void>;
  build?(result: unknown, context: NixKitIntegrationContext): void | Promise<void>;
  clientEntry?(source: string, context: NixKitIntegrationContext): string | void | Promise<string | void>;
  error?(error: unknown, context: NixKitIntegrationContext): void | Promise<void>;
}

export async function runIntegrationHook<K extends keyof Omit<NixKitIntegration, "name">>(
  integrations: readonly NixKitIntegration[],
  hook: K,
  args: Parameters<NonNullable<NixKitIntegration[K]>>,
): Promise<void> {
  for (const integration of integrations) {
    const handler = integration[hook];
    if (typeof handler === "function") await (handler as (...values: unknown[]) => unknown)(...args);
  }
}

// Typed integration hooks for optional packages (plan §11.6).
export {
  type I18nIntegration,
  type AuthIntegration,
  type QueryIntegration,
  type TestingIntegration,
  registerIntegration,
  getI18nIntegration,
  getAuthIntegration,
  getQueryIntegration,
  getTestingIntegration,
  getCustomIntegrations,
  clearIntegrations,
} from "./hooks.js";
