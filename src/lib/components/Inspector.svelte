<script lang="ts">
  // The analysis panel beside the Viewer (Slice 6 shell; tools land in 7-9).
  // Viewer-bound: it's rendered only while a Reference image is open and only
  // when the global `inspectorOpen` preference is on, so mounting *is* "the
  // Inspector was opened for this image" and unmounting is "it was closed".
  // Insets the Viewer's surround (it has its own column) rather than floating
  // over the image, so the whole image stays hoverable for the Slice-7
  // eyedropper. Lays out three regions — readout, histogram, palette — as inert
  // stubs for now.
  import type { Histogram as HistogramData, RefImage, Swatch } from "../types";
  import { reading } from "../stores/eyedropper";
  import { computeHistogram, extractPalette } from "../ipc";
  import { CHANNELS } from "../analysis/draw-histogram";
  import Histogram from "./Histogram.svelte";
  import PaletteBar from "./PaletteBar.svelte";

  let { image }: { image: RefImage } = $props();

  // ~120ms: long enough that holding an arrow key down doesn't decode every
  // image flashed past, short enough to feel instant when you land on one.
  const COMPUTE_DEBOUNCE_MS = 120;

  let histogram = $state<HistogramData | null>(null);
  let histogramStatus = $state<"loading" | "ready" | "unavailable">("loading");

  // Palette swatch count (Slice 9), 3–8, default 5. Changing it recomputes the
  // palette (its $effect depends on `k`) without touching the histogram.
  let k = $state(5);
  let palette = $state<Swatch[] | null>(null);
  let paletteStatus = $state<"loading" | "ready" | "unavailable">("loading");

  // Compute-on-open seam. Re-runs whenever the open image changes — on mount
  // (Inspector opened for this image) and on every page to a new image while
  // open. Clears to the loading state immediately, then debounces the Rust call
  // so rapid paging doesn't spawn a decode per image; the `cancelled` flag drops
  // a stale result when paging outruns an in-flight call (the same pattern
  // PhotographerView uses for list_images). Slice 7's eyedropper is local canvas
  // work and doesn't go through this seam.
  $effect(() => {
    const path = image.path;
    histogram = null;
    histogramStatus = "loading";
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await computeHistogram(path);
        if (!cancelled) {
          histogram = result;
          histogramStatus = "ready";
        }
      } catch {
        // Decode failure (HEIC/AVIF, or a broken file) — show the unavailable
        // state; the eyedropper readout above still works.
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
    const kk = k;
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
</script>

<aside class="inspector" aria-label="Inspector">
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
      <label class="k">
        Colours
        <select bind:value={k} aria-label="Number of palette colours">
          {#each [3, 4, 5, 6, 7, 8] as n (n)}
            <option value={n}>{n}</option>
          {/each}
        </select>
      </label>
    </div>
    <PaletteBar {palette} status={paletteStatus} />
  </section>
</aside>

<style>
  /* Own column beside the surround: fixed width, the image flexes into the rest.
     An opaque dark chrome fill (not glass, not transparent) — the panel sits over
     the content region, not the bare window, so a transparent fill would let the
     grid bleed through; this reads like the dark chrome without that. Divided
     from the image by a hairline. Scrolls if the regions outgrow the height. */
  .inspector {
    flex: none;
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    overflow-y: auto;
    /* Matches the top bar's rendered colour (sampled from screenshots/
       bar-colours.png) so the panel reads as the same chrome. */
    background: #1e1e1e;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
  }

  .region {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Region header with an inline control (the palette's colour-count select)
     pushed to the right of the label. */
  .region-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .k {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fg-dim);
  }
  .k select {
    font: inherit;
    color: var(--fg);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.3rem;
    padding: 0.1rem 0.3rem;
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
