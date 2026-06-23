<script lang="ts">
  // The Inspector's colour-scheme bar (Slice 9). Renders the Rust-computed
  // k-means palette (passed in by the Inspector, which owns the compute seam) as
  // a single proportional bar — each segment's width is its weight. Click a
  // segment to copy its hex; hover/focus reveals hex/RGB/L below the bar; wide
  // segments show their hex inline. Same three states as the histogram: loading
  // (compute in flight), ready (draw), unavailable (decode failed — HEIC/AVIF or
  // a broken file; the eyedropper readout above still works).
  import type { Swatch } from "../types";
  import { luminance } from "../analysis/eyedropper";

  let {
    palette,
    status,
  }: { palette: Swatch[] | null; status: "loading" | "ready" | "unavailable" } = $props();

  // Hovered/focused swatch for the readout line; null ⇒ readout blanks (the row
  // keeps its height so the bar doesn't jump).
  let active = $state<Swatch | null>(null);
  // Index of the just-copied segment, for a brief "copied" flash.
  let copied = $state<number | null>(null);

  // Black text on light swatches, white on dark — by the same Rec.709 luma the
  // eyedropper/histogram use, so the inline hex stays legible.
  const ink = (s: Swatch) => (luminance(s.r, s.g, s.b) > 140 ? "#000" : "#fff");

  // Show the hex inside a segment only when it's wide enough to fit (narrow
  // slivers would clip the text). Weight is the segment's fraction of the bar.
  const INLINE_MIN_WEIGHT = 0.16;

  async function copy(s: Swatch, i: number) {
    try {
      await navigator.clipboard.writeText(s.hex);
      copied = i;
      setTimeout(() => {
        if (copied === i) copied = null;
      }, 900);
    } catch {
      // Clipboard blocked — nothing to recover, the colour is still on screen.
    }
  }
</script>

{#if status === "ready" && palette}
  <div class="palette">
    <div class="bar">
      {#each palette as swatch, i (swatch.hex + i)}
        <button
          class="segment"
          style="flex-grow: {swatch.weight}; background: {swatch.hex}; color: {ink(swatch)}"
          title="{swatch.hex} — click to copy"
          onclick={() => copy(swatch, i)}
          onmouseenter={() => (active = swatch)}
          onmouseleave={() => (active = null)}
          onfocus={() => (active = swatch)}
          onblur={() => (active = null)}
        >
          {#if copied === i}
            <span class="tag">copied</span>
          {:else if swatch.weight >= INLINE_MIN_WEIGHT}
            <span class="tag">{swatch.hex}</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="readout" aria-live="polite">
      {#if active}
        <span class="chip" style="background: {active.hex}" aria-hidden="true"></span>
        <span class="hex">{active.hex}</span>
        <span class="rgb">{active.r} {active.g} {active.b}</span>
        <span class="lum">L {luminance(active.r, active.g, active.b)}</span>
        <span class="pct">{Math.round(active.weight * 100)}%</span>
      {/if}
    </div>
  </div>
{:else if status === "loading"}
  <div class="stub" aria-hidden="true"></div>
{:else}
  <div class="unavailable">Palette unavailable for this image</div>
{/if}

<style>
  .palette {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Single proportional bar: segments flex-grow by weight, so widths read as
     each colour's share of the image. */
  .bar {
    display: flex;
    height: 2.5rem;
    border-radius: 0.4rem;
    overflow: hidden;
  }

  .segment {
    flex: 1 1 0;
    min-width: 0;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font: inherit;
    transition: filter 0.1s;
  }
  .segment:hover,
  .segment:focus-visible {
    filter: brightness(1.12);
    outline: none;
  }

  /* Inline hex / "copied" flash — tabular, slightly shadowed so it survives on
     either a light or dark swatch. */
  .tag {
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    white-space: nowrap;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.3);
  }

  /* Reveal line under the bar. Fixed height so the bar doesn't jump when it
     blanks (cursor off the swatches). */
  .readout {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    height: 1.1rem;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    color: var(--fg-dim);
  }

  .chip {
    flex: none;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 0.2rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
  }
  .hex {
    color: var(--fg);
  }
  .pct {
    margin-left: auto;
  }

  /* Loading / unavailable states mirror the histogram's so the layout is stable
     as the two tools resolve together. */
  .stub,
  .unavailable {
    height: 2.5rem;
    border-radius: 0.4rem;
    border: 1px dashed rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
  }
  .unavailable {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 1rem;
    text-align: center;
    color: var(--fg-dim);
    font-size: 0.8rem;
  }
</style>
