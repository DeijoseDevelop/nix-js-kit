import { html } from "@deijose/nix-js";
import type { LayoutProps } from "../../../../../src/index.ts";

export default function RootLayout({ children }: LayoutProps) {
  return html`<div class="layout">${children}</div>`;
}
