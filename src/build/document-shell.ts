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
  /** Loader data serialized into `<script id="nix-js-data">`. */
  data?: unknown;
  /** Per-page action registry serialized into `<script id="nix-js-actions">`. */
  actions?: Record<string, Record<string, string>>;
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
  const { body, title = "Nix Kit App", lang = "es", data, actions, clientEntry } = opts;

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

  const routerScript = clientEntry ? `\n    <script type="module">${clientRouterCode()}</script>` : "";

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <div id="app">${body}</div>${dataScript}${actionsScript}${entryScript}${routerScript}
  </body>
</html>
`;
}

function clientRouterCode(): string {
  return `(function(){
function i(l){return l.tagName==="A"&&l.hostname===location.hostname&&l.target===""&&!l.getAttribute("download")&&!l.hasAttribute("data-no-router")}
async function n(p,push=true){
const u=new URL("/__nix-js/render",location.origin);u.searchParams.set("page",p);u.searchParams.set("search",location.search);
let r;try{r=await fetch(u.toString(),{headers:{Accept:"text/html"}});}catch(e){return false;}
if(!r.ok)return false;
const h=await r.text(),a=document.getElementById("app");if(!a)return false;
a.innerHTML=h;
const t=h.match(/<title>([^<]*)<\\/title>/);if(t)document.title=t[1];
if(push)history.pushState({n:p},"",p+location.search);window.scrollTo(0,0);
document.dispatchEvent(new CustomEvent("nix-js:rendered"));
return true;}
document.addEventListener("click",async function(e){
const l=e.target.closest("a");if(!l||!i(l))return;const h=l.getAttribute("href");if(!h||h.startsWith("#")||h.startsWith("mailto:")||h.startsWith("javascript:"))return;
if(e.ctrlKey||e.metaKey||e.shiftKey)return;
e.preventDefault();if(!await n(h))location.assign(h+location.search);
});
window.addEventListener("popstate",function(e){n((e.state&&e.state.n)||location.pathname,false);});
})();`;
}
