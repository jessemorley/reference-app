<script lang="ts">
  // The analysis panel beside the Viewer (Slice 6 shell; tools land in 7-9).
  // Viewer-bound: it's rendered only while a Reference image is open and only
  // when the global `inspectorOpen` preference is on, so mounting *is* "the
  // Inspector was opened for this image" and unmounting is "it was closed".
  // Insets the Viewer's surround (it has its own column) rather than floating
  // over the image, so the whole image stays hoverable for the Slice-7
  // eyedropper. Lays out three regions — readout, histogram, palette — as inert
  // stubs for now.
  import type { RefImage } from "../types";
  import { reading } from "../stores/eyedropper";

  let { image }: { image: RefImage } = $props();

  // Compute-on-open seam. The keyed effect below runs this on mount (Inspector
  // opened for the current image) and again on every page to a different image
  // while open. Slices 8 (compute_histogram) and 9 (extract_palette) fill it in,
  // honouring `signal.cancelled` to drop a stale image's result when paging
  // outruns the in-flight call — the same cancellation pattern PhotographerView
  // uses for list_images. Slice 7's eyedropper is local canvas work and doesn't
  // go through here. No-op stub for now.
  function recompute(_image: RefImage, _signal: { cancelled: boolean }) {
    // Histogram + palette calls land here in slices 8-9.
  }

  // Re-run whenever the open image changes — on mount (Inspector opened for the
  // current image) and on every page to a new image while open. Passing `image`
  // to recompute reads the derived, so that read is the tracked dependency; the
  // cleanup flags the in-flight compute as stale before the next image's run, so
  // a slow result never lands on the wrong image.
  $effect(() => {
    const signal = { cancelled: false };
    recompute(image, signal);
    return () => {
      signal.cancelled = true;
    };
  });
</script>

<aside class="inspector" aria-label="Inspector">
  <section class="region">
    <h2 class="label">Colour</h2>
    {#if $reading}
      <div class="readout">
        <span
          class="swatch"
          style="background: rgb({$reading.r}, {$reading.g}, {$reading.b})"
          aria-hidden="true"
        ></span>
        <dl class="channels">
          <div><dt>R</dt><dd>{$reading.r}</dd></div>
          <div><dt>G</dt><dd>{$reading.g}</dd></div>
          <div><dt>B</dt><dd>{$reading.b}</dd></div>
          <div><dt>L</dt><dd>{$reading.l}</dd></div>
        </dl>
      </div>
    {:else}
      <p class="stub">Hover the image to read R / G / B / L.</p>
    {/if}
  </section>
  <section class="region">
    <h2 class="label">Histogram</h2>
    <div class="stub histo" aria-hidden="true"></div>
  </section>
  <section class="region">
    <h2 class="label">Palette</h2>
    <div class="stub palette" aria-hidden="true"></div>
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

  .label {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-dim);
  }

  .stub {
    margin: 0;
    color: var(--fg-dim);
    font-size: 0.85rem;
  }

  /* Live R/G/B/L readout: a colour chip beside four labelled channels. Tabular
     numerals + fixed widths so the values don't jitter as the cursor moves. */
  .readout {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .swatch {
    flex: none;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.4rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .channels {
    display: flex;
    gap: 1rem;
    margin: 0;
  }

  .channels div {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .channels dt {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--fg-dim);
  }

  .channels dd {
    margin: 0;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
  }

  /* Empty placeholders so the layout reads true before the tools fill them. */
  .stub.histo,
  .stub.palette {
    border: 1px dashed rgba(255, 255, 255, 0.12);
    border-radius: 0.4rem;
    background: rgba(255, 255, 255, 0.03);
  }

  .stub.histo {
    height: 180px;
  }

  .stub.palette {
    height: 2.5rem;
  }
</style>
