import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; Svelte's bind:clientHeight (the header's --bar-h
// measurement) needs it. A no-op stub is enough — tests don't assert on it.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
