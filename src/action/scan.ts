import { resolve } from "node:path";
import { scanRoutes } from "../router/route-scanner";

/**
 * Scans `page.action.ts` modules and returns a registry of server actions.
 *
 * The registry maps each exported function name to the file path of the action
 * module that defines it. Only named function exports are collected; default
 * exports are ignored.
 */
export async function scanActions(appDir: string): Promise<Record<string, string>> {
  const routes = await scanRoutes(appDir);
  const actions: Record<string, string> = {};

  for (const page of routes.pages) {
    if (!page.actionPath) continue;
    const actionPath = resolve(page.actionPath);
    const mod = (await import(actionPath)) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) {
      if (name === "default") continue;
      if (typeof value === "function") {
        actions[name] = actionPath;
      }
    }
  }

  return actions;
}
