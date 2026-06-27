<script lang="ts">
  import { reading } from "../stores/eyedropper";
  import type { Vectorscope } from "../types";
  import { drawVectorscope } from "../analysis/draw-vectorscope";

  let {
    vectorscope,
    status,
  }: { vectorscope: Vectorscope | null; status: "loading" | "ready" | "unavailable" } = $props();

  let canvas = $state<HTMLCanvasElement>();
  let zoom = $state<1 | 2>(1);

  $effect(() => {
    const r = $reading;
    const z = zoom;
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
    drawVectorscope(ctx, vectorscope, w, h, r, z);
  });
</script>

{#if status === "ready"}
  <div class="wrap">
    <canvas bind:this={canvas} class="canvas"></canvas>
    <button
      class="zoom-btn"
      class:active={zoom === 2}
      onclick={() => { zoom = zoom === 1 ? 2 : 1; }}
      aria-label="Toggle 2× zoom"
      aria-pressed={zoom === 2}
    >2×</button>
  </div>
{:else if status === "loading"}
  <div class="stub" aria-hidden="true"></div>
{:else}
  <div class="unavailable">Vectorscope unavailable for this image</div>
{/if}

<style>
  .wrap {
    position: relative;
  }

  .canvas {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
  }

  .zoom-btn {
    position: absolute;
    bottom: 0.35rem;
    right: 0.35rem;
    padding: 0.15rem 0.35rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--fg-dim);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.25rem;
    cursor: pointer;
    line-height: 1;
  }
  .zoom-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: var(--fg);
  }
  .zoom-btn.active {
    color: var(--fg);
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
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
