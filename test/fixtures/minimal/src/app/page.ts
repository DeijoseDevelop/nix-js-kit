import { html } from "@deijose/nix-js";
import type { PageProps } from "../../../../../src/index.ts";
import { load } from "./page.data.ts";

export default function HomePage({ data }: PageProps<typeof load>) {
  return html`<h1>${data.title}</h1>`;
}
