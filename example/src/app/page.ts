import { html, signal } from "@deijose/nix-js";
import type { PageProps } from "../../../src/index.ts";
import type { HomeData } from "./page.data.ts";

export default function HomePage({ data }: PageProps<HomeData>) {
  const liked = signal(false);

  return html`
    <article class="home">
      <h1>${data.title}</h1>
      <p>${data.intro}</p>
      <ul>
        ${data.features.map((f) => html`<li>${f}</li>`)}
      </ul>
      <button @click=${() => (liked.value = !liked.value)}>
        ${() => (liked.value ? "★ Liked" : "☆ Like")}
      </button>
    </article>
  `;
}
