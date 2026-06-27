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
    openUrl,
    setPhotographerInfo,
  } from "./lib/ipc";
  import { root } from "./lib/stores/root";
  import {
    selected,
    openIndex,
    search,
    refreshSignal,
    canBack,
    back,
  } from "./lib/stores/navigation";
  import {
    settings,
    backdrop,
    asBackdrop,
    inspectorOpen,
    asInspectorOpen,
    paletteK,
    asPaletteK,
  } from "./lib/stores/settings";
  import Folder from "@lucide/svelte/icons/folder";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Globe from "@lucide/svelte/icons/globe";
  import House from "@lucide/svelte/icons/house";
  import AtSign from "@lucide/svelte/icons/at-sign";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Search from "@lucide/svelte/icons/search";
  import User from "@lucide/svelte/icons/user";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
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
      selected.set(null); // back to root; closes any open photographer/viewer
      openIndex.set(null);
      search.set(""); // search is cleared when the folder changes
      root.set(chosen);
    }
  }

  // ⌘R re-runs the active view's scan in place (the view re-fetches silently —
  // no "Scanning…" flash). preventDefault stops the webview's own reload.
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && editingInfo) { cancelEditInfo(); return; }
    if (e.metaKey && e.key === "r") {
      e.preventDefault();
      refreshSignal.update((n) => n + 1);
    }
  }

  // Inline info editor for the name bar.
  let editingInfo = $state(false);
  let draftInstagram = $state("");
  let draftWebsite = $state("");
  let draftBlurb = $state("");

  function startEditInfo() {
    draftInstagram = $selected?.instagram ?? "";
    draftWebsite = $selected?.website ?? "";
    draftBlurb = $selected?.blurb ?? "";
    editingInfo = true;
  }

  function cancelEditInfo() {
    editingInfo = false;
  }

  function saveInfo() {
    if (!$selected || !$root) return;
    const ig = draftInstagram.trim().replace(/^@/, "") || null;
    const w = draftWebsite.trim() || null;
    const b = draftBlurb.trim() || null;
    void setPhotographerInfo($root, $selected.relPath, ig, b, w);
    selected.update((p) => (p ? { ...p, instagram: ig, website: w, blurb: b } : p));
    editingInfo = false;
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
      blurAt = null;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} onfocus={onFocus} onblur={onBlur} />
{#if editingInfo}
  <button class="info-scrim" tabindex="-1" aria-hidden="true" onclick={cancelEditInfo}></button>
{/if}

<!-- Stands in for the hidden-inset titlebar; drag anywhere along the top. -->
<div class="titlebar" data-tauri-drag-region></div>

{#if !ready}
  <div class="center"><span class="dim">Loading…</span></div>
{:else if $root === null}
  <RootPicker />
{:else}
  <div class="shell">
    <!-- Drag region: the bar's own background/padding/gaps move the window.
         Tauri only drags on the exact element bearing the attribute, so the
         buttons and search input (no attribute) stay interactive — only the
         empty bar area and the name-box label below drag. -->
    <header class="bar" data-tauri-drag-region>
      <!-- Back ascends one level (image → grid → root); Home jumps straight to
           root. Leftmost at every level, both disabled at the root. -->
      <div class="nav">
        <button
          class="nav-btn"
          onclick={back}
          disabled={!$canBack}
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <button
          class="nav-btn"
          onclick={() => {
            selected.set(null);
            openIndex.set(null);
          }}
          disabled={!$canBack}
          title="Home"
          aria-label="Home"
        >
          <House size={16} aria-hidden="true" />
        </button>
      </div>

      {#if $selected}
        <div class="search-wrap">
          <User class="search-icon" size={15} aria-hidden="true" />
          <span class="name-box" title={$selected.name} data-tauri-drag-region
            >{$selected.name}</span
          >
          <div class="social-icons">
            <button
              class="social-btn pencil-btn"
              class:active={editingInfo}
              type="button"
              aria-label="Edit photographer info"
              onclick={startEditInfo}
            ><Pencil size={12} aria-hidden="true" /></button>
            {#if $selected.instagram}
              <button
                class="social-btn"
                title="Instagram: @{$selected.instagram}"
                aria-label="Open Instagram profile for {$selected.name}"
                onclick={() => void openUrl(`https://instagram.com/${$selected!.instagram}`)}
              ><AtSign size={13} aria-hidden="true" /></button>
            {/if}
            {#if $selected.website}
              <button
                class="social-btn"
                title={$selected.website}
                aria-label="Open website for {$selected.name}"
                onclick={() => void openUrl($selected!.website!)}
              ><Globe size={13} aria-hidden="true" /></button>
            {/if}
          </div>
          {#if editingInfo}
            <!-- svelte-ignore a11y_autofocus -->
            <form class="info-popover" onsubmit={(e) => { e.preventDefault(); saveInfo(); }}>
              <textarea
                class="info-field"
                rows={3}
                placeholder="Bio…"
                autofocus
                bind:value={draftBlurb}
              ></textarea>
              <div class="info-row">
                <span class="info-prefix">@</span>
                <input class="info-field" type="text" placeholder="instagram" bind:value={draftInstagram} />
              </div>
              <input class="info-field" type="url" placeholder="https://…" bind:value={draftWebsite} />
              <button class="info-save" type="submit">Save</button>
            </form>
          {/if}
        </div>
        <div class="group">
          <button
            class="icon-btn"
            title="Reveal this photographer's folder in Finder"
            aria-label="Reveal this photographer's folder in Finder"
            onclick={() => revealInFinder(`${$root}/${$selected!.relPath}`).catch(() => {})}
          >
            <FolderOpen size={15} aria-hidden="true" />
          </button>
          {#if $openIndex === null}
            <TileSizeSlider view="photographer" />
          {/if}
        </div>
      {:else}
        <div class="search-wrap">
          <Search class="search-icon" size={15} aria-hidden="true" />
          <input
            class="search"
            type="search"
            placeholder="Search photographers…"
            aria-label="Search photographers"
            title={$root}
            bind:value={$search}
          />
        </div>
        <div class="group">
          <button
            class="icon-btn"
            onclick={change}
            title="Change folder…"
            aria-label="Change folder…"
          >
            <Folder size={15} aria-hidden="true" />
          </button>
          <TileSizeSlider view="root" />
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
    /* Even gap so the nav buttons and the search/path read as one evenly
       spaced cluster (matches .nav's inter-button gap); .group restores the
       wider spacing on its side. */
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    /* Chrome, not content: the bar's labels (path, photographer name) shouldn't
       be selectable like body text. -webkit- for the macOS WKWebView. */
    -webkit-user-select: none;
    user-select: none;
  }

  /* Photographer name, boxed to read like the search bar it replaces at this
     level (same border/background/radius, User icon in place of the magnifier).
     A static span, not an input — it's a label, not a field. */
  .name-box {
    flex: 1;
    min-width: 0;
    /* Left padding clears the User icon; right padding reserves space for up to
       2 social icons (each ~18px) + gap. */
    padding: 0.35rem 3.2rem 0.35rem 1.85rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.4rem;
    background: rgba(255, 255, 255, 0.05);
    color: var(--fg);
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Back button, leftmost in the bar. */
  .nav {
    flex: none;
    display: flex;
    gap: 0.5rem;
  }

  /* Square icon-only buttons sized to the bar's button height. */
  .nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem;
  }

  .nav-btn:disabled {
    opacity: 0.35;
    cursor: default;
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

  /* Icon + label on one baseline-centred row. */
  .icon-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* Social icons + pencil pinned to the right inside the name bar. */
  .social-icons {
    position: absolute;
    right: 0.55rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 0.2rem;
    pointer-events: auto;
  }

  .social-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 0;
    background: none;
    color: var(--fg-dim);
    opacity: 0.6;
    transition: opacity 0.12s;
  }

  .social-btn:hover {
    opacity: 1;
  }

  /* Pencil hidden by default, revealed on name-bar hover or while editing. */
  .pencil-btn {
    opacity: 0;
  }

  .search-wrap:hover .pencil-btn,
  .pencil-btn.active {
    opacity: 0.5;
  }

  .pencil-btn:hover {
    opacity: 1 !important;
  }

  /* Edit popover: drops below the name bar. z-index sits above the scrim. */
  .info-popover {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #2a2a2a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .info-field {
    width: 100%;
    box-sizing: border-box;
    padding: 0.35rem 0.5rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.35rem;
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    resize: none;
  }

  .info-field:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .info-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .info-prefix {
    font-size: 0.8rem;
    color: var(--fg-dim);
    flex: none;
  }

  .info-row .info-field {
    flex: 1;
    width: auto;
  }

  .info-save {
    align-self: flex-end;
    padding: 0.25rem 0.7rem !important;
    font-size: 0.78rem !important;
    border-radius: 0.35rem !important;
    background: var(--accent) !important;
    border: none !important;
    color: #000;
    font-weight: 600;
  }

  /* Click-away scrim behind the popover. */
  .info-scrim {
    position: fixed;
    inset: 0;
    z-index: 99;
    background: transparent;
    border: none;
    padding: 0;
    cursor: default;
  }

  /* Wraps the input so the search icon can sit inside its left edge. */
  .search-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
  }

  .search-wrap :global(.search-icon) {
    position: absolute;
    left: 0.6rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--fg-dim);
    pointer-events: none;
  }

  .search {
    flex: 1;
    min-width: 0;
    /* Left padding clears the icon. */
    padding: 0.35rem 0.6rem 0.35rem 1.85rem;
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

</style>
