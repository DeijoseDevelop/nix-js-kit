import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { image, consumeImageRegistry, type ImageOptions } from "../src/image/index.ts";
import { renderToString } from "../src/render/render-to-string.ts";

async function renderToHtml(tpl: ReturnType<typeof image>): Promise<string> {
  return renderToString(() => tpl);
}

describe("image()", () => {
  it("emits an <img> with src, alt, width, height", async () => {
    const html = await renderToHtml(image({
      src: "/images/hero.jpg",
      alt: "Hero",
      width: 800,
      height: 600,
    }));
    assert.ok(html.includes('src="/images/hero.jpg"'));
    assert.ok(html.includes('alt="Hero"'));
    assert.ok(html.includes('width="800"'));
    assert.ok(html.includes('height="600"'));
  });

  it("emits loading=lazy and decoding=async by default", async () => {
    const html = await renderToHtml(image({
      src: "/images/hero.jpg",
      alt: "Hero",
      width: 800,
      height: 600,
    }));
    assert.ok(html.includes('loading="lazy"'));
    assert.ok(html.includes('decoding="async"'));
  });

  it("emits fetchpriority=high and omits loading=lazy when priority", async () => {
    const html = await renderToHtml(image({
      src: "/images/hero.jpg",
      alt: "Hero",
      width: 800,
      height: 600,
      priority: true,
    }));
    assert.ok(html.includes('fetchpriority="high"'));
    assert.ok(!html.includes('loading="lazy"'));
  });

  it("does not emit unresolved responsive variant URLs", async () => {
    const html = await renderToHtml(image({
      src: "/images/hero.jpg",
      alt: "Hero",
      width: 800,
      height: 600,
      widths: [400, 800, 1200],
    }));
    assert.ok(!html.includes('srcset="'));
    assert.ok(!html.includes("/images/hero-400w.jpg"));
    assert.ok(html.includes('src="/images/hero.jpg"'));
  });

  it("emits sizes attribute when provided", async () => {
    const html = await renderToHtml(image({
      src: "/images/hero.jpg",
      alt: "Hero",
      width: 800,
      height: 600,
      sizes: "(min-width: 768px) 50vw, 100vw",
    }));
    assert.ok(html.includes('sizes="(min-width: 768px) 50vw, 100vw"'));
  });

  it("emits class and extra attributes", async () => {
    const html = await renderToHtml(image({
      src: "/images/hero.jpg",
      alt: "Hero",
      width: 800,
      height: 600,
      class: "hero-img",
      attributes: { id: "hero", "data-test": "value" },
    }));
    assert.ok(html.includes('class="hero-img"'));
    assert.ok(html.includes('id="hero"'));
    assert.ok(html.includes('data-test="value"'));
  });

  it("escapes quotes in attributes to prevent XSS breakout", async () => {
    const html = await renderToHtml(image({
      src: "/images/hero.jpg",
      alt: '"><script>alert(1)</script>',
      width: 800,
      height: 600,
    }));
    // The double quote must be escaped so the attacker cannot close the
    // alt attribute and inject a script tag as a real element.
    assert.ok(html.includes("&quot;"));
    // There should be exactly one <img> tag (the attacker's script must not
    // become a separate element).
    assert.equal((html.match(/<img/g) || []).length, 1);
  });

  it("registers images for build-time processing", async () => {
    consumeImageRegistry();
    await renderToHtml(image({
      src: "/images/a.jpg",
      alt: "A",
      width: 800,
      height: 600,
      widths: [400, 800],
    }));
    await renderToHtml(image({
      src: "/images/b.jpg",
      alt: "B",
      width: 1200,
      height: 900,
    }));
    const registry = consumeImageRegistry();
    assert.equal(registry.length, 2);
    assert.equal(registry[0].src, "/images/a.jpg");
    assert.deepEqual(registry[0].widths, [400, 800]);
    assert.equal(registry[1].src, "/images/b.jpg");
  });

  it("does not duplicate registrations for same src+widths", async () => {
    consumeImageRegistry();
    const opts: ImageOptions = {
      src: "/images/dup.jpg",
      alt: "Dup",
      width: 800,
      height: 600,
      widths: [400, 800],
    };
    await renderToHtml(image(opts));
    await renderToHtml(image(opts));
    const registry = consumeImageRegistry();
    assert.equal(registry.length, 1);
  });
});
