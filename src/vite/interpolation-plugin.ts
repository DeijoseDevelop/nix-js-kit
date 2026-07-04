import type { Plugin } from "vite";

/**
 * Transforms Nix.js `html\`\`` templates so that attributes with partial
 * interpolation become a single interpolation expression.
 *
 * Nix.js requires every dynamic attribute to be a single interpolation covering
 * the whole value. This plugin rewrites patterns such as:
 *
 *   html\`<a href="/blog/${slug}">...</a>\`
 *
 * into:
 *
 *   html\`<a href=${"/blog/" + slug}>...</a>\`
 *
 * Only files inside the app and islands directories are processed.
 */
export interface InterpolationPluginOptions {
  appDir?: string;
  islandsDir?: string;
}

const HTML_TAG = "html";
const TEMPLATE_START = "`";

export function transformPartialInterpolations(source: string): string {
  let result = "";
  let i = 0;
  while (i < source.length) {
    // Find the next html` sequence.
    const htmlIndex = source.indexOf(HTML_TAG, i);
    if (htmlIndex === -1) {
      result += source.slice(i);
      break;
    }
    result += source.slice(i, htmlIndex + HTML_TAG.length);
    i = htmlIndex + HTML_TAG.length;

    // Skip whitespace before the backtick.
    while (i < source.length && /\s/.test(source[i])) {
      result += source[i];
      i++;
    }
    if (i >= source.length || source[i] !== TEMPLATE_START) {
      continue;
    }
    result += source[i];
    i++;

    // Parse the template literal until the matching backtick.
    let depth = 1;
    let templateContent = "";
    while (i < source.length && depth > 0) {
      const char = source[i];
      if (char === "\\") {
        templateContent += char + source[i + 1];
        i += 2;
        continue;
      }
      if (char === TEMPLATE_START) {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      if (char === "$") {
        // Look ahead for ${...}
        if (source[i + 1] === "{") {
          let braceDepth = 1;
          let j = i + 2;
          while (j < source.length && braceDepth > 0) {
            if (source[j] === "{") braceDepth++;
            if (source[j] === "}") braceDepth--;
            j++;
          }
          templateContent += source.slice(i, j);
          i = j;
          continue;
        }
      }
      templateContent += char;
      i++;
    }

    const transformed = transformTemplateContent(templateContent);
    result += transformed;
    result += TEMPLATE_START;
  }
  return result;
}

function transformTemplateContent(content: string): string {
  // Match attribute values that contain at least one interpolation.
  // We look for: attr="...${...}..." or attr='...${...}...'
  const attrRegex = /(\s)([a-zA-Z@:][a-zA-Z0-9-@:]*)(\s*=\s*)(["'])([^"']*\$\{[^}]+\}[^"']*)\4/g;
  return content.replace(attrRegex, (_match, leadingSpace, name, equals, _quote, value) => {
    const expression = valueToExpression(value);
    return `${leadingSpace}${name}${equals}\${${expression}}`;
  });
}

function valueToExpression(value: string): string {
  // Convert a quoted attribute value like /blog/${slug} into a JS expression.
  // We split the value into literal parts and ${...} interpolations.
  const parts: string[] = [];
  let i = 0;
  while (i < value.length) {
    const interpolationStart = value.indexOf("${", i);
    if (interpolationStart === -1) {
      const literal = value.slice(i);
      if (literal) parts.push(JSON.stringify(literal));
      break;
    }
    const literal = value.slice(i, interpolationStart);
    if (literal) parts.push(JSON.stringify(literal));
    let braceDepth = 1;
    let j = interpolationStart + 2;
    while (j < value.length && braceDepth > 0) {
      if (value[j] === "{") braceDepth++;
      if (value[j] === "}") braceDepth--;
      j++;
    }
    const expr = value.slice(interpolationStart + 2, j - 1);
    if (expr.trim()) parts.push(`(${expr})`);
    i = j;
  }

  if (parts.length === 0) return "\"\"";
  if (parts.length === 1) return parts[0] as string;
  return parts.join(" + ");
}

export function nixJsInterpolationPlugin(options: InterpolationPluginOptions = {}): Plugin {
  const appDir = options.appDir ?? "src/app";
  const islandsDir = options.islandsDir ?? "src/islands";
  return {
    name: "nix-js-kit-interpolation",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(".ts") && !id.endsWith(".js")) return;
      if (!id.includes(appDir) && !id.includes(islandsDir)) return;
      if (!code.includes("html`")) return;
      const transformed = transformPartialInterpolations(code);
      if (transformed === code) return;
      return { code: transformed, map: null };
    },
  };
}
