<script lang="ts">
  // The analysis panel beside the Viewer (Slice 6 shell; tools land in 7-9).
  // Viewer-bound: it's rendered only while a Reference image is open and only
  // when the global `inspectorOpen` preference is on, so mounting *is* "the
  // Inspector was opened for this image" and unmounting is "it was closed".
  // Insets the Viewer's surround (it has its own column) rather than floating
  // over the image, so the whole image stays hoverable for the Slice-7
  // eyedropper. Lays out three regions — readout, histogram, palette — as inert
  // stubs for now.
  import type { Histogram as HistogramData, RefImage, Swatch, Vectorscope as VectorscopeData } from "../types";
  import { reading } from "../stores/eyedropper";
  import { paletteK, PALETTE_K_MIN, PALETTE_K_MAX } from "../stores/settings";
  import { computeHistogram, computeVectorscope, extractPalette, setPaletteK } from "../ipc";
  import { CHANNELS } from "../analysis/draw-histogram";
  import Histogram from "./Histogram.svelte";
  import PaletteBar from "./PaletteBar.svelte";
  import Vectorscope from "./Vectorscope.svelte";
  import { inspectorReveal } from "../motion";

  let { image }: { image: RefImage } = $props();

  // ~120ms: long enough that holding an arrow key down doesn't decode every
  // image flashed past, short enough to feel instant when you land on one.
  const COMPUTE_DEBOUNCE_MS = 120;

  let histogram = $state<HistogramData | null>(null);
  let histogramStatus = $state<"loading" | "ready" | "unavailable">("loading");

  let vectorscope = $state<VectorscopeData | null>(null);
  let vectorscopeStatus = $state<"loading" | "ready" | "unavailable">("loading");

  // Palette swatch count (Slice 9), 3–8. A global durable preference (the
  // Inspector remounts per open/page, so a local value would reset); changing it
  // recomputes the palette (its $effect depends on `$paletteK`) without touching
  // the histogram, and persists to the backend store.
  let palette = $state<Swatch[] | null>(null);
  let paletteStatus = $state<"loading" | "ready" | "unavailable">("loading");

  // Compute-on-open seam. Re-runs whenever the open image changes — on mount
  // (Inspector opened for this image) and on every page to a new image while
  // open. Clears to the loading state immediately, then debounces the Rust call
  // so rapid paging doesn't spawn a decode per image; the `cancelled` flag drops
  // a stale result when paging outruns an in-flight call (the same pattern
  // PhotographerView uses for list_images). Slice 7's eyedropper is local canvas
  // work and doesn't go through this seam.
  // Histogram + vectorscope share one debounced, cancellable call: one decode
  // failure (HEIC/AVIF, broken file) drives both to "unavailable" together.
  $effect(() => {
    const path = image.path;
    histogram = null;
    histogramStatus = "loading";
    vectorscope = null;
    vectorscopeStatus = "loading";
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const h = await computeHistogram(path);
        if (!cancelled) {
          histogram = h;
          histogramStatus = "ready";
        }
      } catch {
        if (!cancelled) histogramStatus = "unavailable";
      }
    }, COMPUTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  // Palette (Slice 9) has its own seam: it depends on `k` as well as the image,
  // so a separate $effect lets changing k recompute the palette alone without
  // re-decoding for the histogram. Same debounce / cancellation / unavailable
  // handling as above (one decode-failure path per tool).
  $effect(() => {
    const path = image.path;
    const kk = $paletteK;
    palette = null;
    paletteStatus = "loading";
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await extractPalette(path, kk);
        if (!cancelled) {
          palette = result;
          paletteStatus = "ready";
        }
      } catch {
        if (!cancelled) paletteStatus = "unavailable";
      }
    }, COMPUTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  // Step the palette colour-count by ±1, clamped to the valid range, and persist.
  function stepK(delta: number) {
    const next = Math.min(PALETTE_K_MAX, Math.max(PALETTE_K_MIN, $paletteK + delta));
    if (next !== $paletteK) {
      paletteK.set(next);
      void setPaletteK(next);
    }
  }
</script>

<aside class="inspector" aria-label="Inspector" transition:inspectorReveal>
  <div class="panel">
  <section class="region">
    <h2 class="label">Value</h2>
    <div class="readout">
      <span
        class="swatch"
        class:empty={!$reading}
        style={$reading
          ? `background: rgb(${$reading.r}, ${$reading.g}, ${$reading.b})`
          : ""}
        aria-hidden="true"
      ></span>
      <div class="channels">
        <span style="color: {CHANNELS.r}">{$reading?.r ?? " "}</span>
        <span style="color: {CHANNELS.g}">{$reading?.g ?? " "}</span>
        <span style="color: {CHANNELS.b}">{$reading?.b ?? " "}</span>
        <span class="l">{$reading?.l ?? " "}</span>
      </div>
    </div>
  </section>
  <section class="region">
    <h2 class="label">Histogram</h2>
    <Histogram {histogram} status={histogramStatus} />
  </section>
  <section class="region">
    <div class="region-head">
      <h2 class="label">Palette</h2>
      <div class="k">
        <span class="k-label">Colours</span>
        <button
          class="step"
          onclick={() => stepK(-1)}
          disabled={$paletteK <= PALETTE_K_MIN}
          aria-label="Fewer palette colours"
        >
          −
        </button>
        <span class="k-value" aria-live="polite">{$paletteK}</span>
        <button
          class="step"
          onclick={() => stepK(1)}
          disabled={$paletteK >= PALETTE_K_MAX}
          aria-label="More palette colours"
        >
          +
        </button>
      </div>
    </div>
    <PaletteBar {palette} status={paletteStatus} />
  </section>
  <!-- <section class="region">
    <h2 class="label">Vectorscope</h2>
    <Vectorscope {vectorscope} status={vectorscopeStatus} />
  </section> -->
  </div>
</aside>

<style>
  /* Own column beside the surround: fixed width, the image flexes into the rest.
     An opaque dark chrome fill (not glass, not transparent) — the panel sits over
     the content region, not the bare window, so a transparent fill would let the
     grid bleed through; this reads like the dark chrome without that. Divided
     from the image by a hairline. Scrolls if the regions outgrow the height. */
  /* Clipping shell: holds the column's resting width, but its *width* is what the
     open/close transition animates (so the image surround beside it resizes in
     step). overflow:hidden clips the fixed-width .panel inside; justify-content
     pins that panel to the right edge, so it tucks into/out of the window edge
     rather than revealing from the left. */
  .inspector {
    flex: none;
    width: 300px;
    overflow: hidden;
    display: flex;
    justify-content: flex-end;
  }

  /* The panel proper: a fixed width so its content never reflows while the shell
     animates — the transition only uncovers it. Carries the chrome the shell used
     to: matches the top bar's colour (sampled from screenshots/bar-colours.png)
     so it reads as the same chrome, divided by a hairline. */
  .panel {
    flex: none;
    width: 300px;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    overflow-y: auto;
    background: #1e1e1e;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
  }

  .region {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Region header with an inline control (the palette's colour-count stepper)
     pushed to the right of the label. */
  .region-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* Colour-count stepper: a label, then − / value / + in a compact cluster. */
  .k {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .k-label {
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fg-dim);
  }
  .k-value {
    min-width: 1ch;
    text-align: center;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
  }

  /* Small square +/- buttons; the glyph is centred and the hit area stays tidy. */
  .step {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.3rem;
    height: 1.3rem;
    padding: 0;
    font-size: 0.95rem;
    line-height: 1;
    color: var(--fg);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.3rem;
    cursor: pointer;
  }
  .step:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
  }
  .step:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .label {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-dim);
  }

  /* Live readout on one row: a small colour chip beside the four channel values.
     The values themselves carry the R/G/B colour (no separate labels); L is
     neutral. Tabular numerals so they don't jitter as the cursor moves. */
  .readout {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .swatch {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.3rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  /* No reading yet (cursor off the image): a dashed, unfilled chip so the slot
     reads as "empty" rather than showing a stale colour. */
  .swatch.empty {
    background: rgba(255, 255, 255, 0.03);
    border-style: dashed;
  }

  .channels {
    display: flex;
    gap: 0.55rem;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }

  /* Each value gets a fixed three-digit slot (max is 255), centred — so going
     from 2 to 3 digits grows symmetrically about the centre rather than shoving
     the neighbouring channels around. */
  .channels span {
    display: inline-block;
    width: 3ch;
    text-align: center;
  }

  /* R/G/B values are tinted inline from CHANNELS (single source, shared with the
     histogram strokes); L stays neutral. */
  .channels .l {
    color: var(--fg);
  }
</style>
