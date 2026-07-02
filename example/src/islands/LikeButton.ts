import { html, signal } from "@deijose/nix-js";

export interface LikeButtonProps {
  postId: string;
}

export default function LikeButton({ postId }: LikeButtonProps) {
  const liked = signal(false);

  return html`
    <button
      class="like-button"
      aria-label="Like post ${postId}"
      @click=${() => {
      liked.value = !liked.value;
      console.log(`post ${postId} liked:`, liked.value);
    }}
    >
      ${() => (liked.value ? "★ Liked" : "☆ Like")}
    </button>
  `;
}
