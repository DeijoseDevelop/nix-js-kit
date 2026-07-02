import { html } from "@deijose/nix-js";
import type { PageProps } from "@deijose/nix-js-kit";

export default function FeaturesPage(_props: PageProps) {
  return html`
    <article class="features">
      <h1>Features</h1>
      <p>SSG, islands, file-based routing and more.</p>
    </article>
  `;
}
