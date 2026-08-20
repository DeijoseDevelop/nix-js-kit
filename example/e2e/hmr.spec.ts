import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// HMR E2E: changing an island source must hot-swap the module without a full
// page reload (audit §10.2 / §12.2). Uses the Vite plugin dev server.
const COUNTER_PATH = resolve(import.meta.dirname, "../src/islands/Counter.ts");

test("island HMR updates the DOM without a full page reload", async ({ page }) => {
  const original = await readFile(COUNTER_PATH, "utf8");

  await page.goto("/");
  await expect(page.locator(".counter-value").first()).toHaveText("3");
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);

  try {
    // Add a marker attribute to the island template and write it.
    await writeFile(
      COUNTER_PATH,
      original.replace('<div class="counter">', '<div class="counter" data-hmr="yes">'),
      "utf8",
    );

    // The HMR accept callback re-hydrates with the updated module.
    await expect
      .poll(() => page.evaluate(() => !!document.querySelector('.counter[data-hmr="yes"]')), {
        timeout: 10_000,
      })
      .toBe(true);

    // And it must NOT have triggered a full page navigation.
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
  } finally {
    // Restore the original file so the fixture stays clean.
    await writeFile(COUNTER_PATH, original, "utf8");
    await expect
      .poll(() => page.evaluate(() => !document.querySelector('.counter[data-hmr="yes"]')), {
        timeout: 10_000,
      })
      .toBe(true);
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
  }
});
