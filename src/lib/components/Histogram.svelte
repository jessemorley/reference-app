<script lang="ts">
  // The Inspector's histogram (Slice 8). Renders a Rust-computed 256-bin r/g/b/l
  // histogram (passed in by the Inspector, which owns the compute-on-open seam)
  // onto a Canvas, with an amber hover line that tracks the eyedropper's L value.
  // Three states: loading (compute in flight), ready (draw), unavailable (decode
  // failed — e.g. HEIC/AVIF, which the image crate can't decode; the eyedropper
  // readout above still works).
  import { reading } from "../stores/eyedropper";
  import type { Histogram } from "../types";
  import { drawHistogram, prepare } from "../analysis/draw-histogram";

  let {
    histogram,
    status,
  }: { histogram: Histogram | null; status: "loading" | "ready" | "unavailable" } = $props();

  let canvas = $state<HTMLCanvasElement>();

  // Smooth the channels once per histogram (not per hover frame) — only the
  // hover line moves between frames, the curves don't.
  let prepared = $derived(histogram ? prepare(histogram) : null);

  // Redraw on histogram change and on every eyedropper move (the hover line).
  // Sizes the backing store to the device pixel ratio so the 1px lines stay crisp
  // on Retina, then draws in CSS px. Only reassigns canvas.width/height when the
  // dimensions actually change — reassigning reallocates the bitmap, so guarding
  // it avoids a needless realloc on every hover frame (drawHistogram clears).
  $effect(() => {
    const r = $reading;
    const p = prepared;
    if (status !== "ready" || !p || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dw = Math.round(w * dpr);
    const dh = Math.round(h * dpr);
    if (canvas.width !== dw) canvas.width = dw;
    if (canvas.height !== dh) canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHistogram(ctx, p, w, h, r);
  });
</script>

{#if status === "ready"}
  <canvas bind:this={canvas} class="canvas"></canvas>
{:else if status === "loading"}
  <div class="stub" aria-hidden="true"></div>
{:else}
  <div class="unavailable">Histogram unavailable for this image</div>
{/if}

<style>
  .canvas,
  .stub,
  .unavailable {
    height: 180px;
    border-radius: 0.4rem;
  }

  .canvas {
    display: block;
    width: 100%;
  }

  /* Loading placeholder — matches the Slice-6 stub so the layout doesn't jump. */
  .stub {
    border: 1px dashed rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
  }

  /* Decode failed (HEIC/AVIF or a broken file): quiet message, no canvas. */
  .unavailable {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 1rem;
    text-align: center;
    color: var(--fg-dim);
    font-size: 0.8rem;
    border: 1px dashed rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
  }
</style>
