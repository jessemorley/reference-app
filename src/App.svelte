<script lang="ts">
  import { onMount } from "svelte";
  import {
    getBackdrop,
    getInspectorOpen,
    getPaletteK,
    setPaletteK,
    getRoot,
    getTileSizes,
    selectRoot,
    revealInFinder,
  } from "./lib/ipc";
  import { root } from "./lib/stores/root";
  import { selected, search, refreshSignal } from "./lib/stores/navigation";
  import {
    settings,
    backdrop,
    asBackdrop,
    inspectorOpen,
    asInspectorOpen,
    paletteK,
    asPaletteK,
  } from "./lib/stores/settings";
  import RootPicker from "./lib/components/RootPicker.svelte";
  import PhotographerGrid from "./lib/components/PhotographerGrid.svelte";
  import PhotographerView from "./lib/components/PhotographerView.svelte";
  import TileSizeSlider from "./lib/components/TileSizeSlider.svelte";

  // null = checked, no root yet; undefined = still checking.
  let ready = $state(false);

  onMount(async () => {
    // Hydrate persisted state before first paint of the shell. Tile sizes keep
    // their defaults for any view the user hasn't adjusted yet.
    const [persistedRoot, tiles, savedBackdrop, savedInspectorOpen, savedPaletteK] =
      await Promise.all([
        getRoot(),
        getTileSizes(),
        getBackdrop(),
        getInspectorOpen(),
        getPaletteK(),
      ]);
    settings.update((s) => ({
      root: tiles.root ?? s.root,
      photographer: tiles.photographer ?? s.photographer,
    }));
    backdrop.set(asBackdrop(savedBackdrop));
    inspectorOpen.set(asInspectorOpen(savedInspectorOpen));
    const k = asPaletteK(savedPaletteK);
    paletteK.set(k);
    // Heal a divergent stored value (out-of-range or fractional from an older
    // build / hand-edit): write the coerced k back so it stops being re-clamped
    // every launch. Skip when never set (null) — defaults aren't persisted until
    // the user touches the control, matching the other prefs.
    if (savedPaletteK !== null && savedPaletteK !== k) void setPaletteK(k);
    root.set(persistedRoot);
    ready = true;
  });

  async function change() {
    const chosen = await selectRoot();
    if (chosen) {
      selected.set(null); // close any open photographer view before re-scanning
      search.set(""); // search is cleared when the folder changes
      root.set(chosen);
    }
  }

  // ⌘R re-runs the active view's scan in place (the view re-fetches silently —
  // no "Scanning…" flash). preventDefault stops the webview's own reload.
  function onKeydown(e: KeyboardEvent) {
    if (e.metaKey && e.key === "r") {
      e.preventDefault();
      refreshSignal.update((n) => n + 1);
    }
  }

  // Auto-rescan on focus return, but only after a real absence (>5s) so a quick
  // tab-away doesn't re-walk the tree. blurAt is null while focused.
  let blurAt: number | null = null;
  function onBlur() {
    blurAt = Date.now();
  }
  function onFocus() {
    if (blurAt !== null && Date.now() - blurAt > 5000) {
      refreshSignal.update((n) => n + 1);
    }
    blurAt = null;
  }
</script>

<svelte:window onkeydown={onKeydown} onfocus={onFocus} onblur={onBlur} />

<!-- Stands in for the hidden-inset titlebar; drag anywhere along the top. -->
<div class="titlebar" data-tauri-drag-region></div>

{#if !ready}
  <div class="center"><span class="dim">Loading…</span></div>
{:else if $root === null}
  <RootPicker />
{:else}
  <div class="shell">
    <header class="bar">
      {#if $selected}
        <div class="group">
          <button class="back" onclick={() => selected.set(null)}
            >‹ Photographers</button
          >
          <span class="path" title={$selected.name}>{$selected.name}</span>
        </div>
        <div class="group">
          <button
            title="Reveal this photographer's folder in Finder"
            onclick={() => revealInFinder(`${$root}/${$selected!.relPath}`)}
            >Reveal in Finder</button
          >
          <TileSizeSlider view="photographer" />
        </div>
      {:else}
        <input
          class="search"
          type="search"
          placeholder="Search photographers…"
          aria-label="Search photographers"
          title={$root}
          bind:value={$search}
        />
        <div class="group">
          <TileSizeSlider view="root" />
          <button onclick={change}>Change folder…</button>
        </div>
      {/if}
    </header>
    {#if $selected}
      <PhotographerView root={$root!} photographer={$selected} />
    {:else}
      <PhotographerGrid root={$root!} onselect={(p) => selected.set(p)} />
    {/if}
  </div>
{/if}

<style>
  .center {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 2rem;
    text-align: center;
  }

  .dim {
    color: var(--fg-dim);
    margin: 0;
  }

  /* Loaded shell: a thin header above a scrolling grid. Sits in #app's 1fr
     row; min-height: 0 lets it stay within that track so the grid scrolls
     rather than the whole shell growing. */
  .shell {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    /* Chrome, not content: the bar's labels (path, photographer name) shouldn't
       be selectable like body text. -webkit- for the macOS WKWebView. */
    -webkit-user-select: none;
    user-select: none;
  }

  .path {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.85rem;
    color: var(--fg-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Size every header button to the search bar (same text size, vertical
     padding and radius), so the bar reads as one row of equal-height controls.
     1px border matches the search input's, so the box heights line up. */
  .bar button {
    flex: none;
    padding: 0.35rem 0.7rem;
    font-size: 0.85rem;
    border-radius: 0.4rem;
  }

  .search {
    flex: 1;
    min-width: 0;
    padding: 0.35rem 0.6rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.4rem;
    background: rgba(255, 255, 255, 0.05);
    color: var(--fg);
    font: inherit;
    font-size: 0.85rem;
  }

  .search::placeholder {
    color: var(--fg-dim);
  }

  .search:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  /* Keeps related header items together so .bar's space-between still pushes
     the path to one edge and the controls to the other. min-width: 0 lets the
     path ellipsis inside a group. */
  .group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  /* Back affordance reads as a quiet link, not a chunky button. Inherits the
     .bar button height; only the chrome is stripped back. */
  .back {
    background: transparent;
    border-color: transparent;
  }
</style>
