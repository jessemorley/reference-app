import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; Svelte's bind:clientHeight (the header's --bar-h
// measurement) needs it. A no-op stub is enough — tests don't assert on it.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom implements neither the Web Animations API nor matchMedia; Svelte's
// transitions (Element.animate) and our reduced-motion check (src/lib/motion.ts)
// need both. Stubs that resolve instantly are enough — tests assert on final DOM
// state, not on the animation itself.
Element.prototype.animate ??= function () {
  const anim = {
    onfinish: null as null | (() => void),
    oncancel: null as null | (() => void),
    cancel() {},
    finished: Promise.resolve(),
    play() {},
    pause() {},
    addEventListener() {},
    removeEventListener() {},
  };
  // Resolve on the next microtask so any `onfinish` handler Svelte assigns fires
  // and the element settles into its end state.
  queueMicrotask(() => anim.onfinish?.());
  return anim as unknown as Animation;
};

globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof globalThis.matchMedia;
