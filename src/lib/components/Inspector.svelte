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

  // Re-run per distinct open image (keyed on path, the stable identity). Runs
  // once on mount; the cleanup flags the in-flight compute as stale before the
  // next image's run, so a slow result never lands on the wrong image.
  $effect(() => {
    image.path; // track
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
    <p class="stub">Hover the image to read R / G / B / L.</p>
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
     Dark glass over the window vibrancy, divided from the image by a hairline.
     Scrolls if the regions ever outgrow the height. */
  .inspector {
    flex: none;
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    overflow-y: auto;
    background: rgba(28, 28, 30, 0.6);
    backdrop-filter: blur(20px);
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
