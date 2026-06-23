<script lang="ts">
  // The Inspector's histogram (Slice 8). Renders a Rust-computed 256-bin r/g/b/l
  // histogram (passed in by the Inspector, which owns the compute-on-open seam)
  // onto a Canvas, with an amber hover line that tracks the eyedropper's L value.
  // Three states: loading (compute in flight), ready (draw), unavailable (decode
  // failed — e.g. HEIC/AVIF, which the image crate can't decode; the eyedropper
  // readout above still works).
  import { reading } from "../stores/eyedropper";
  import type { Histogram } from "../types";
  import { drawHistogram } from "../analysis/draw-histogram";

  let {
    histogram,
    status,
  }: { histogram: Histogram | null; status: "loading" | "ready" | "unavailable" } = $props();

  let canvas = $state<HTMLCanvasElement>();

  // Redraw on histogram change and on every eyedropper move (the hover line).
  // Backs the canvas store with the device pixel ratio so the 1px lines stay
  // crisp on Retina, then draws in CSS px.
  $effect(() => {
    const r = $reading;
    const hist = histogram;
    if (status !== "ready" || !hist || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHistogram(ctx, hist, w, h, r);
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
