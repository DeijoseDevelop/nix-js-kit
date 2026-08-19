import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jsonLd } from "../src/seo/index.ts";

describe("jsonLd() security (A-19)", () => {
  it("escapes </script> to prevent tag injection", () => {
    const html = jsonLd({
      "@context": "https://schema.org",
      "@type": "Article",
      name: "</script><script>alert(1)</script>",
    });
    // The raw </script> sequence must NOT appear inside the JSON payload.
    // Only the closing tag of the jsonLd script itself should be present.
    const scriptTags = html.match(/<\/script>/gi);
    assert.equal(scriptTags?.length, 1, "should have exactly one </script> (the closing tag)");
    // The injected content should be escaped.
    assert.ok(!html.includes("alert(1)</script>"), "should not contain unescaped script injection");
    assert.ok(html.includes("\\u003c"), "should escape < as \\u003c");
  });

  it("escapes < in all string values", () => {
    const html = jsonLd({
      "@context": "https://schema.org",
      "@type": "Product",
      description: "Price < 100",
    });
    assert.ok(!html.includes("Price < 100"), "should escape < in values");
    assert.ok(html.includes("\\u003c"), "should use unicode escape for <");
  });

  it("escapes & to prevent entity interpretation", () => {
    const html = jsonLd({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "A & B Corp",
    });
    assert.ok(!html.includes("A & B Corp"), "should escape & in values");
    assert.ok(html.includes("\\u0026"), "should use unicode escape for &");
  });

  it("escapes line/paragraph separators (U+2028/U+2029)", () => {
    const html = jsonLd({
      "@context": "https://schema.org",
      "@type": "Article",
      name: "Line1\u2028Line2\u2029Para2",
    });
    assert.ok(!html.includes("\u2028"), "should escape U+2028");
    assert.ok(!html.includes("\u2029"), "should escape U+2029");
  });

  it("preserves valid JSON structure after escaping", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Test",
      author: { "@type": "Person", name: "Jane" },
    };
    const html = jsonLd(schema);
    // Extract the JSON from the script tag and verify it parses.
    const match = html.match(/<script type="application\/ld\+json">(.+)<\/script>/s);
    assert.ok(match, "should have a script tag with JSON content");
    const jsonStr = match[1];
    // Unescape the unicode escapes to verify the original data is recoverable.
    const unescaped = jsonStr
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&")
      .replace(/\\u2028/g, "\u2028")
      .replace(/\\u2029/g, "\u2029");
    const parsed = JSON.parse(unescaped);
    assert.equal(parsed.headline, "Test");
    assert.equal(parsed.author.name, "Jane");
  });

  it("handles arrays of schemas", () => {
    const html = jsonLd([
      { "@context": "https://schema.org", "@type": "Article", headline: "A" },
      { "@context": "https://schema.org", "@type": "Product", name: "B" },
    ]);
    assert.ok(html.includes("application/ld+json"));
    // Should still be valid (escaped) JSON array.
    const match = html.match(/<script type="application\/ld\+json">(.+)<\/script>/s);
    assert.ok(match);
    assert.ok(match[1].startsWith("["));
  });
});
