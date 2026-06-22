<script lang="ts">
  // Full-resolution single-image surface (Slice 5). A prop-driven overlay: it
  // knows nothing about tabs or filtering — PhotographerView hands it the active
  // tab's `images` and the open `index`, and asks to close or page via callbacks.
  // Covers the content region by default; the corner toggle expands it to fill
  // the window (ephemeral — every open starts windowed). All geometry lives in
  // the pure ../viewer/transform module so the Slice-7 eyedropper can reuse it.
  import type { RefImage } from "../types";
  import { assetUrl, setBackdrop, setInspectorOpen } from "../ipc";
  import {
    backdrop,
    BACKDROP_HEX,
    inspectorOpen,
    type Backdrop,
  } from "../stores/settings";
  import Inspector from "./Inspector.svelte";
  import {
    fitScale,
    fitTransform,
    zoomToward,
    clampPan,
    wrapIndex,
    type Transform,
  } from "../viewer/transform";
  import {
    luminance,
    samplingCanvasSize,
    toCanvasSample,
  } from "../analysis/eyedropper";
  import { reading } from "../stores/eyedropper";

  let {
    images,
    index,
    onclose,
    onpage,
  }: {
    images: RefImage[];
    index: number;
    onclose: () => void;
    onpage: (index: number) => void;
  } = $props();

  const ZOOM_IN = 1.25;
  const ZOOM_OUT = 1 / ZOOM_IN;

  // Eased transform for zoom commands only (⌘±/⌘0) — a Preview-like decelerate.
  // Pan and per-image refit set this off so dragging tracks the pointer 1:1 and
  // paging snaps to fit without sliding.
  const ZOOM_EASE = "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)";
  let animateZoom = $state(false);

  let expanded = $state(false);

  // Viewport size (bound to the surround element); 0 until first measured.
  let vw = $state(0);
  let vh = $state(0);

  // Clamp the incoming index to the current set. The parent's `index` can briefly
  // outrun `images` when the active-tab set shrinks while the viewer is open
  // (`images` is the active tab's `shown`, derived from a global store); an
  // out-of-range index would render a blank overlay. Paging re-syncs the parent.
  let safeIndex = $derived(
    images.length === 0 ? 0 : Math.min(Math.max(index, 0), images.length - 1)
  );
  let image = $derived(images[safeIndex]);
  let src = $derived(image ? assetUrl(image.path) : null);

  // Per-load state. `natural` is a fresh object each load so the fit effect
  // re-runs even when consecutive images share dimensions.
  let natural = $state<{ width: number; height: number } | null>(null);
  let loaded = $state(false);
  let failed = $state(false);
  let transform = $state<Transform>({ scale: 1, tx: 0, ty: 0 });

  // Fit scale for the current image+viewport, derived once so the hot pan path
  // (zoomedIn, drag/scroll) doesn't recompute it on every transform mutation.
  let fit = $derived(natural ? fitScale({ width: vw, height: vh }, natural) : 1);

  // Reset the load lifecycle whenever the source changes (paging / reopen).
  $effect(() => {
    src; // track
    natural = null;
    loaded = false;
    failed = false;
  });

  // Snap the transform to a centred fit. Shared by the auto-fit effect (instant,
  // on image/viewport change) and ⌘0 (eased).
  function refit(animate: boolean) {
    if (!natural || vw === 0 || vh === 0) return;
    animateZoom = animate;
    transform = fitTransform(viewport(), natural);
  }

  // Fit fresh whenever the image or the viewport changes — paging resets the
  // transform, and a resize/expand refits rather than stranding an off-screen
  // zoom. Reads natural/vw/vh (not `transform`), so zoom/pan mutations don't
  // re-trigger it. Instant (no easing) so a new image doesn't slide into place.
  $effect(() => {
    refit(false);
  });

  function onImgLoad(e: Event) {
    const el = e.currentTarget as HTMLImageElement;
    natural = { width: el.naturalWidth, height: el.naturalHeight };
    loaded = true;
  }

  function viewport() {
    return { width: vw, height: vh };
  }

  function zoom(factor: number) {
    if (!natural || vw === 0 || vh === 0) return;
    const t = zoomToward(transform, { x: vw / 2, y: vh / 2 }, factor, fit);
    animateZoom = true;
    transform = clampPan(t, viewport(), natural);
  }

  function resetZoom() {
    refit(true);
  }

  function panBy(dx: number, dy: number) {
    if (!natural) return;
    animateZoom = false;
    transform = clampPan(
      { scale: transform.scale, tx: transform.tx + dx, ty: transform.ty + dy },
      viewport(),
      natural
    );
  }

  let zoomedIn = $derived(natural !== null && transform.scale > fit + 1e-6);

  // The Inspector is meaningful only for a successfully displayed image. The
  // toggle (button + ⌘I) and the panel all gate on this, so the global pref is
  // never flipped/persisted with no panel to show (the empty-set race), and the
  // Slice 8-9 compute seam never fires on undecodable pixels (a failed image).
  let canInspect = $derived(!!image && !failed);

  function page(delta: number) {
    onpage(wrapIndex(safeIndex + delta, images.length));
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      // Close the viewer outright; the header back button still pops the whole
      // photographer view.
      if (menu) closeMenu();
      else onclose();
      return;
    }
    // With the backdrop menu open, swallow paging/zoom so the keys don't act on
    // the image behind it (Escape above closes the menu first).
    if (menu) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      page(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      page(-1);
    } else if (e.metaKey && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      zoom(ZOOM_IN);
    } else if (e.metaKey && e.key === "-") {
      e.preventDefault();
      zoom(ZOOM_OUT);
    } else if (e.metaKey && e.key === "0") {
      e.preventDefault();
      resetZoom();
    } else if (
      canInspect &&
      e.metaKey &&
      !e.altKey &&
      !e.ctrlKey &&
      (e.key === "i" || e.key === "I")
    ) {
      // ⌘I toggles the Inspector (matches macOS Preview's Show Inspector). Gated
      // on canInspect so it never flips (and persists) the pref with no panel to
      // show; the alt/ctrl guard keeps ⌘⌥I / ⌘⌃I chords from triggering it. Only
      // bound while the Viewer is open, and swallowed above when the menu is up.
      e.preventDefault();
      toggleInspector();
    }
  }

  // The Inspector's shown-state is a durable global preference (settings store +
  // backend), not transient overlay state — so persist on every toggle, exactly
  // like the Backdrop. The panel itself only renders while the Viewer is open.
  function toggleInspector() {
    inspectorOpen.update((open) => {
      const next = !open;
      void setInspectorOpen(next);
      return next;
    });
  }

  // Scroll pans (scroll is not zoom — ⌘± owns zoom). Natural direction: content
  // moves opposite the scroll delta.
  function onWheel(e: WheelEvent) {
    if (!zoomedIn) return;
    e.preventDefault();
    panBy(-e.deltaX, -e.deltaY);
  }

  // Drag pans when zoomed in. Pointer capture keeps the drag alive past the edge.
  let dragging = $state(false);
  function onPointerdown(e: PointerEvent) {
    if (!zoomedIn || e.button !== 0) return;
    dragging = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointermove(e: PointerEvent) {
    if (!dragging) return;
    panBy(e.movementX, e.movementY);
  }
  function onPointerup(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
  }

  // --- Eyedropper (Slice 7, ADR-0001) --------------------------------------
  // A *separate* hidden source <img crossOrigin="anonymous"> is decoded and drawn
  // once into an offscreen sampling canvas (capped to WebKit's max area); each
  // hover reads the 1×1 pixel under the cursor. Kept off the display <img> so a
  // CORS misstep can't regress the viewer, and active only while the Inspector is
  // open — its Colour region is the only readout target (the pure source→canvas
  // map + luma maths live in ../analysis/eyedropper).
  let sampleCtx: CanvasRenderingContext2D | null = null;
  let sampleSize: { width: number; height: number } | null = null;

  // Build (and tear down) the sampling canvas when the Inspector is open and the
  // image is displayable. Re-runs on paging (src) and on toggling the Inspector;
  // clears the reading on every (re)build so a stale value never lingers.
  $effect(() => {
    reading.set(null);
    if (!$inspectorOpen || !src || !loaded || failed) {
      sampleCtx = null;
      sampleSize = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const size = samplingCanvasSize({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      const c = document.createElement("canvas");
      c.width = size.width;
      c.height = size.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size.width, size.height);
      sampleCtx = ctx;
      sampleSize = size;
      // Drawn — drop the handler so the decoded source can be freed; the canvas
      // now holds the only copy we need (approach A's extra decode is transient,
      // not held for the open-image lifetime). The cleanup deliberately does NOT
      // capture `img`, so nothing keeps it (or its bitmap) reachable past here.
      img.onload = null;
    };
    img.src = src;
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafPending);
      rafPending = 0;
      sampleCtx = null;
      sampleSize = null;
      reading.set(null);
    };
  });

  // rAF-coalesce: store the latest cursor point, do at most one read per frame.
  let rafPending = 0;
  let lastPoint: { x: number; y: number } | null = null;

  function onSampleMove(e: MouseEvent) {
    if (!sampleCtx || !sampleSize || !natural) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    lastPoint = { x: e.clientX - box.left, y: e.clientY - box.top };
    if (!rafPending) rafPending = requestAnimationFrame(sampleNow);
  }

  function sampleNow() {
    rafPending = 0;
    if (!sampleCtx || !sampleSize || !natural || !lastPoint) return;
    const at = toCanvasSample(transform, lastPoint, natural, sampleSize);
    if (!at) {
      reading.set(null);
      return;
    }
    try {
      const [r, g, b] = sampleCtx.getImageData(at.x, at.y, 1, 1).data;
      reading.set({ r, g, b, l: luminance(r, g, b) });
    } catch {
      // Tainted canvas (CORS not as expected): stop sampling rather than throw
      // every frame. The "done when" runtime check is meant to catch this early.
      sampleCtx = null;
      reading.set(null);
    }
  }

  function onSampleLeave() {
    if (rafPending) {
      cancelAnimationFrame(rafPending);
      rafPending = 0;
    }
    lastPoint = null;
    reading.set(null);
  }

  // Right-click the surround → backdrop menu. Right-clicking the *image* is
  // reserved for Slice-10 image actions, so suppress the native menu there and
  // do nothing for now.
  let viewerEl!: HTMLDivElement;
  let menu = $state<{ x: number; y: number } | null>(null);
  function onContextmenu(e: MouseEvent) {
    e.preventDefault();
    if ((e.target as HTMLElement).tagName === "IMG") return;
    // The menu renders at the Viewer level (not inside the surround) so it can lie
    // over the Inspector rather than being clipped at the surround's edge. Place
    // it relative to the Viewer's own box — not the window, or it lands offset by
    // the titlebar + header in windowed mode — and clamp so a near-edge right-
    // click keeps the menu fully on-screen.
    const box = viewerEl.getBoundingClientRect();
    const x = Math.min(e.clientX - box.left, Math.max(0, box.width - MENU_W));
    const y = Math.min(e.clientY - box.top, Math.max(0, box.height - MENU_H));
    menu = { x, y };
  }
  function closeMenu() {
    menu = null;
  }
  function chooseBackdrop(token: Backdrop) {
    backdrop.set(token);
    void setBackdrop(token);
    closeMenu();
  }

  const BACKDROPS: { token: Backdrop; label: string }[] = [
    { token: "black", label: "Black" },
    { token: "white", label: "White" },
    { token: "grey", label: "Grey" },
  ];

  // Approximate menu footprint, used only to clamp it inside the Viewer on a
  // near-edge right-click. Width tracks the .menu min-width (9rem); height covers
  // the three backdrop rows plus padding. Overshooting just nudges the menu in.
  const MENU_W = 160;
  const MENU_H = 150;
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Outer box: the whole Viewer. role/aria mark it as a modal image surface; it
     lays the surround and (when open) the Inspector out as a row. Windowed it
     fills the content region; expanded it's fixed over the whole window. -->
<div
  class="viewer"
  class:expanded
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  aria-label={image ? `Viewing ${image.name}` : "Image viewer"}
  bind:this={viewerEl}
>
  <!-- The surround: the image column, filled with the persisted Backdrop. Bound
       to vw/vh so all fit/zoom/pan math tracks the *visible* image width — which
       shrinks when the Inspector insets it. Pointer/scroll/right-click handlers
       live here so the whole surround responds, not just the image. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="surround"
    style="background: {BACKDROP_HEX[$backdrop]}"
    bind:clientWidth={vw}
    bind:clientHeight={vh}
    onwheel={onWheel}
    onpointerdown={onPointerdown}
    onpointermove={onPointermove}
    onpointerup={onPointerup}
    onmousemove={onSampleMove}
    onmouseleave={onSampleLeave}
    oncontextmenu={onContextmenu}
  >
    {#if image}
      {#if failed}
        <p class="state">Can't display this image.</p>
      {:else if !loaded}
        <p class="state">Loading…</p>
      {/if}

      {#if src}
        <img
          class="image"
          class:hidden={!loaded || failed}
          class:grabbable={zoomedIn && !$inspectorOpen}
          class:grabbing={dragging && !$inspectorOpen}
          {src}
          alt={image.name}
          draggable="false"
          decoding="async"
          style="transform: translate({transform.tx}px, {transform.ty}px) scale({transform.scale}); transform-origin: top left; transition: {animateZoom
            ? ZOOM_EASE
            : 'none'}"
          onload={onImgLoad}
          onerror={() => (failed = true)}
        />
      {/if}
    {/if}

    <!-- Corner control cluster: Inspector toggle + expand (backdrop is
         right-click). Pinned to the image column's corner, so it sits just left
         of the Inspector when that's open. The Inspector toggle shows only when
         there's a displayable image to inspect — same canInspect gate as ⌘I and
         the panel, so the control can't drift from the thing it controls. -->
    <div class="controls">
      {#if canInspect}
        <button
          class="ctrl"
          type="button"
          title={$inspectorOpen ? "Hide Inspector" : "Show Inspector"}
          aria-label={$inspectorOpen ? "Hide Inspector" : "Show Inspector"}
          aria-pressed={$inspectorOpen}
          onclick={toggleInspector}
        >
          ◨
        </button>
      {/if}
      <button
        class="ctrl"
        type="button"
        title={expanded ? "Shrink to window" : "Expand to fill window"}
        aria-label={expanded ? "Shrink to window" : "Expand to fill window"}
        aria-pressed={expanded}
        onclick={() => (expanded = !expanded)}
      >
        {expanded ? "⤡" : "⤢"}
      </button>
    </div>
  </div>

  <!-- Inspector insets the surround when open; only with a displayable image to
       inspect. Spelled out as `image && !failed` (rather than canInspect) so the
       compiler narrows `image` to non-null for the prop — same condition. -->
  {#if $inspectorOpen && image && !failed}
    <Inspector {image} />
  {/if}

  <!-- Backdrop menu sits at the Viewer level so it can render over the Inspector
       column rather than being clipped at the surround's overflow:hidden edge. -->
  {#if menu}
    <!-- Click-away catcher closes the menu; sits under it. -->
    <button
      class="scrim"
      type="button"
      tabindex="-1"
      aria-hidden="true"
      onclick={closeMenu}
      oncontextmenu={(e) => {
        e.preventDefault();
        closeMenu();
      }}
    ></button>
    <ul
      class="menu"
      role="menu"
      aria-label="Backdrop"
      style="left: {menu.x}px; top: {menu.y}px"
    >
      {#each BACKDROPS as b (b.token)}
        <li role="none">
          <button
            class="item"
            type="button"
            role="menuitemradio"
            aria-checked={$backdrop === b.token}
            onclick={() => chooseBackdrop(b.token)}
          >
            <span class="check">{$backdrop === b.token ? "✓" : ""}</span>
            {b.label}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* Windowed: fills the content region (its positioned ancestor in
     PhotographerView). Expanded: fixed over the whole window — the titlebar and
     header included; traffic lights are OS-drawn and stay clickable on top.
     A row so the Inspector can take its own column beside the image surround. */
  .viewer {
    position: absolute;
    inset: 0;
    display: flex;
    overflow: hidden;
    z-index: 10;
    user-select: none;
  }

  .viewer.expanded {
    position: fixed;
  }

  /* The image column. Flexes into whatever the Inspector leaves; positioned so
     the image and controls lay out against it (the backdrop menu lays out
     against the Viewer instead, so it can overlay the Inspector). */
  .surround {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .image {
    position: absolute;
    top: 0;
    left: 0;
    /* Drawn at natural size; the transform scales/translates it. */
    will-change: transform;
  }

  .image.hidden {
    visibility: hidden;
  }

  .image.grabbable {
    cursor: grab;
  }

  .image.grabbing {
    cursor: grabbing;
  }

  .state {
    position: absolute;
    inset: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-dim);
    /* A mid backdrop can wash out dim text; a soft halo keeps it legible. */
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }

  .controls {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: flex;
    gap: 0.4rem;
  }

  .ctrl {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 0.5rem;
    background: rgba(20, 20, 22, 0.55);
    backdrop-filter: blur(12px);
    color: var(--fg);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }

  .ctrl:hover {
    background: rgba(40, 40, 44, 0.7);
  }

  /* Transparent full-cover catcher so a click anywhere dismisses the menu. */
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 20;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: default;
  }

  .menu {
    position: absolute;
    z-index: 21;
    min-width: 9rem;
    margin: 0;
    padding: 0.3rem;
    list-style: none;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 0.6rem;
    background: rgba(28, 28, 30, 0.82);
    backdrop-filter: blur(20px);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4rem 0.5rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .check {
    width: 1em;
    color: var(--fg-dim);
  }
</style>
