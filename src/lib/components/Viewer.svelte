<script lang="ts">
  // Full-resolution single-image surface (Slice 5). A prop-driven overlay: it
  // knows nothing about tabs or filtering — PhotographerView hands it the active
  // tab's `images` and the open `index`, and asks to close or page via callbacks.
  // Covers the content region by default; the corner toggle expands it to fill
  // the window (ephemeral — every open starts windowed). All geometry lives in
  // the pure ../viewer/transform module so the Slice-7 eyedropper can reuse it.
  import type { RefImage } from "../types";
  import { assetUrl, setBackdrop } from "../ipc";
  import { backdrop, BACKDROP_HEX, type Backdrop } from "../stores/settings";
  import {
    fitScale,
    fitTransform,
    zoomToward,
    clampPan,
    wrapIndex,
    type Transform,
  } from "../viewer/transform";

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
    }
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

  // Right-click the surround → backdrop menu. Right-clicking the *image* is
  // reserved for Slice-10 image actions, so suppress the native menu there and
  // do nothing for now.
  let menu = $state<{ x: number; y: number } | null>(null);
  function onContextmenu(e: MouseEvent) {
    e.preventDefault();
    if ((e.target as HTMLElement).tagName === "IMG") return;
    // The menu is positioned within the viewer (absolute, or fixed when
    // expanded), so place it relative to the viewer's own box — not the window —
    // or it lands offset by the titlebar + header in windowed mode.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menu = { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
</script>

<svelte:window onkeydown={onKeydown} />

<!-- The surround. role/aria mark it as a modal image surface; the fill is the
     persisted Backdrop. Pointer/scroll/right-click handlers live here so the
     whole surround responds, not just the image. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="viewer"
  class:expanded
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  aria-label={image ? `Viewing ${image.name}` : "Image viewer"}
  style="background: {BACKDROP_HEX[$backdrop]}"
  bind:clientWidth={vw}
  bind:clientHeight={vh}
  onwheel={onWheel}
  onpointerdown={onPointerdown}
  onpointermove={onPointermove}
  onpointerup={onPointerup}
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
        class:grabbable={zoomedIn}
        class:grabbing={dragging}
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

  <!-- Corner control cluster: just the expand toggle (backdrop is right-click). -->
  <div class="controls">
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
     header included; traffic lights are OS-drawn and stay clickable on top. */
  .viewer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    z-index: 10;
    user-select: none;
  }

  .viewer.expanded {
    position: fixed;
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
