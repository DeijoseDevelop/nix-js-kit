// =============================================================================
// --- HTML document shell ---
// =============================================================================
//
// The root `layout.ts` is a plain Nix component (renderable via `_render`).
// The <!DOCTYPE>, <head> and <body> wrapper — plus the serialized loader data
// and the client entry — are injected here at build time.
// =============================================================================

export interface ShellOptions {
  /** Rendered inner HTML that goes inside `#app`. */
  body: string;
  /** `<title>` text. */
  title?: string;
  /** `<html lang>` attribute. */
  lang?: string;
  /** Additional attributes for the `<html>` element, e.g. `{ "data-theme": "dark" }`. */
  htmlAttributes?: Record<string, string>;
  /**
   * Inline scripts injected into `<head>`. They run synchronously while the
   * document parses — before the first paint and before the (deferred) client
   * bundle — so they are the right place for no-flash bootstrapping (e.g.
   * applying a stored theme before the page becomes visible).
   */
  headScripts?: string[];
  /** Loader data serialized into `<script id="nix-js-data">`. */
  data?: unknown;
  /** Per-page action names serialized into `<script id="nix-js-actions">`. */
  actions?: Record<string, string[]>;
  /** Path to the client entry module, e.g. `/_nix-js/entry-client.js`. */
  clientEntry?: string;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Serializes data for embedding inside a `<script>` tag. Escapes `<` so a
 * `</script>` sequence in the data cannot break out of the tag.
 */
function serializeData(data: unknown): string {
  return JSON.stringify(data ?? null).replace(/</g, "\\u003c");
}

/** Wraps rendered body HTML into a full HTML document. */
export function documentShell(opts: ShellOptions): string {
  const { body, title = "Nix Kit App", lang = "es", data, actions, clientEntry, htmlAttributes, headScripts } = opts;

  const dataScript =
    data !== undefined
      ? `\n    <script type="application/json" id="nix-js-data">${serializeData(data)}</script>`
      : "";

  const actionsScript = actions && Object.keys(actions).length > 0
    ? `\n    <script type="application/json" id="nix-js-actions">${serializeData(actions)}</script>`
    : "";

  const entryScript = clientEntry
    ? `\n    <script type="module" src="${escapeHtml(clientEntry)}"></script>`
    : "";

  const htmlAttrs = htmlAttributes
    ? Object.entries(htmlAttributes)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => ` ${escapeHtml(key)}="${escapeHtml(String(value))}"`)
        .join("")
    : "";

  const headScriptsHtml = headScripts
    ? headScripts
        .filter((script) => typeof script === "string" && script.trim().length > 0)
        .map((script) => `\n    <script>${script.replace(/<\/script>/gi, "<\\/script>")}</script>`)
        .join("")
    : "";

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}"${htmlAttrs}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>${headScriptsHtml}
  </head>
  <body>
    <div id="app">${body}</div>${dataScript}${actionsScript}${entryScript}
  </body>
</html>
`;
}
