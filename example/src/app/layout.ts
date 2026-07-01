import { html } from "@deijose/nix-js";
import type { LayoutProps } from "../../../src/index.ts";

export default function RootLayout({ children }: LayoutProps) {
  return html`
    <div class="site">
      <header>
        <a href="/">Home</a>
        <a href="/about">About</a>
      </header>
      <main>${children}</main>
      <footer>Nix Kit v0.1</footer>
    </div>
  `;
}
