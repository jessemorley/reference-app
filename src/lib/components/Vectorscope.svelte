<script lang="ts">
  // The Inspector's vectorscope (Slice 12). Renders a Rust-computed 128×128
  // Cb/Cr density grid onto a square Canvas, with an amber crosshair that
  // tracks the eyedropper's Cb/Cr position. Three states: loading, ready,
  // unavailable (decode failed — same HEIC/AVIF path as Histogram.svelte).
  import { reading } from "../stores/eyedropper";
  import type { Vectorscope } from "../types";
  import { drawVectorscope } from "../analysis/draw-vectorscope";

  let {
    vectorscope,
    status,
  }: { vectorscope: Vectorscope | null; status: "loading" | "ready" | "unavailable" } = $props();

  let canvas = $state<HTMLCanvasElement>();

  // Redraw whenever the scope data changes or the eyedropper moves.
  // Sizes the backing store to DPR so the plot stays crisp on Retina.
  $effect(() => {
    const r = $reading;
    if (status !== "ready" || !vectorscope || !canvas) return;
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
    drawVectorscope(ctx, vectorscope, w, h, r);
  });
</script>

{#if status === "ready"}
  <canvas bind:this={canvas} class="canvas"></canvas>
{:else if status === "loading"}
  <div class="stub" aria-hidden="true"></div>
{:else}
  <div class="unavailable">Vectorscope unavailable for this image</div>
{/if}

<style>
  .canvas {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 50%; /* circular scope */
  }

  .stub,
  .unavailable {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
  }

  .stub {
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
    border: 1px dashed rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
  }
</style>
