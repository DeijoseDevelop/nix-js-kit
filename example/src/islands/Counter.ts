import { html, signal } from "@deijose/nix-js";

export interface CounterProps {
  start?: number;
  step?: number;
}

export default function Counter({ start = 0, step = 1 }: CounterProps) {
  const count = signal(start);

  return html`
    <div class="counter">
      <button
        class="counter-dec"
        aria-label="Decrement"
        @click=${() => (count.value -= step)}
      >
        −
      </button>
      <span class="counter-value">${() => count.value}</span>
      <button
        class="counter-inc"
        aria-label="Increment"
        @click=${() => (count.value += step)}
      >
        +
      </button>
    </div>
  `;
}
