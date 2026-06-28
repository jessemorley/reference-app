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
    getGridGap,
    setGridGap,
  } from "./lib/ipc";
  import { root } from "./lib/stores/root";
  import {
    selected,
    openIndex,
    search,
    refreshSignal,
    canBack,
    back,
    rootView,
    activeTab,
    tabs,
    selectTab,
  } from "./lib/stores/navigation";
  import {
    settings,
    backdrop,
    asBackdrop,
    inspectorOpen,
    asInspectorOpen,
    paletteK,
    asPaletteK,
    gridGap,
    asGridGap,
    GRID_GAP_MIN,
    GRID_GAP_MAX,
    GRID_GAP_STEP,
    type TileView,
  } from "./lib/stores/settings";
  import Folder from "@lucide/svelte/icons/folder";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Globe from "@lucide/svelte/icons/globe";
  import House from "@lucide/svelte/icons/house";
  import Image from "@lucide/svelte/icons/image";
  import SquareUser from "@lucide/svelte/icons/square-user";
  import AtSign from "@lucide/svelte/icons/at-sign";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Search from "@lucide/svelte/icons/search";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import User from "@lucide/svelte/icons/user";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import RootPicker from "./lib/components/RootPicker.svelte";
  import PhotographerGrid from "./lib/components/PhotographerGrid.svelte";
  import PhotographerView from "./lib/components/PhotographerView.svelte";
  import AllImagesView from "./lib/components/AllImagesView.svelte";
  import TileSizeSlider from "./lib/components/TileSizeSlider.svelte";

  // null = checked, no root yet; undefined = still checking.
  let ready = $state(false);
  // Bar floats over the content; its measured height offsets the scrollers and
  // pins the tab bar just beneath it (cascaded as --bar-h).
  let barH = $state(0);

  // The tabbed views publish their own tabs; the root photographer grid has
  // none, so clear any left over from a view we just navigated away from.
  $effect(() => {
    if (!$selected && $rootView === "photographers") tabs.set([]);
  });

  onMount(async () => {
    // Hydrate persisted state before first paint of the shell. Tile sizes keep
    // their defaults for any view the user hasn't adjusted yet.
    const [persistedRoot, tiles, savedBackdrop, savedInspectorOpen, savedPaletteK, savedGridGap] =
      await Promise.all([
        getRoot(),
        getTileSizes(),
        getBackdrop(),
        getInspectorOpen(),
        getPaletteK(),
        getGridGap(),
      ]);
    settings.update((s) => ({
      root: tiles.root ?? s.root,
      photographer: tiles.photographer ?? s.photographer,
    }));
    backdrop.set(asBackdrop(savedBackdrop));
    inspectorOpen.set(asInspectorOpen(savedInspectorOpen));
    const k = asPaletteK(savedPaletteK);
    paletteK.set(k);
    if (savedPaletteK !== null && savedPaletteK !== k) void setPaletteK(k);
    if (savedGridGap !== null) gridGap.set(asGridGap(savedGridGap));
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

  // Which tile view is active (determines which size slider to show in settings).
  let activeView = $derived<TileView>(
    $selected || $rootView === "images" ? "photographer" : "root"
  );

  // Settings popover open state.
  let settingsOpen = $state(false);

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
{#if settingsOpen}
  <button class="settings-scrim" tabindex="-1" aria-hidden="true" onclick={() => (settingsOpen = false)}></button>
{/if}

<!-- The loaded shell's bar is its own full-width drag region (covers the top,
     traffic lights and all); only the bar-less screens need this stand-in
     titlebar strip so the window stays draggable there too. -->
{#if !ready}
  <div class="titlebar" data-tauri-drag-region></div>
  <div class="center"><span class="dim">Loading…</span></div>
{:else if $root === null}
  <div class="titlebar" data-tauri-drag-region></div>
  <RootPicker />
{:else}
  <div class="shell" style="--bar-h: {barH}px; --grid-gap: {$gridGap}px">
    <!-- Drag region: the bar's own background/padding/gaps move the window.
         Tauri only drags on the exact element bearing the attribute, so the
         buttons and search input (no attribute) stay interactive — only the
         empty bar area and the name-box label below drag. -->
    <header class="bar" data-tauri-drag-region bind:clientHeight={barH}>
      <!-- Top strip beside the OS traffic lights: filter tabs live here,
           published by the active view. Empty otherwise, just reserving the
           traffic-light clearance for the controls row below. Hidden while an
           image is open (the Viewer takes the space). -->
      <div class="title-strip" data-tauri-drag-region>
        {#if $tabs.length > 0 && $openIndex === null}
          <nav class="tabs" aria-label="Categories">
            {#each $tabs as t (t.key)}
              <button
                class="tab"
                class:active={$activeTab === t.key}
                type="button"
                aria-pressed={$activeTab === t.key}
                onclick={() => selectTab(t.key)}
              >
                {t.label}<span class="count">{t.count}</span>
              </button>
            {/each}
          </nav>
        {/if}
      </div>

     <div class="bar-row" data-tauri-drag-region>
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
      {:else}
        <div class="search-wrap">
          <Search class="search-icon" size={15} aria-hidden="true" />
          <input
            class="search"
            type="search"
            placeholder={$rootView === "images"
              ? "Search images…"
              : "Search photographers…"}
            aria-label={$rootView === "images"
              ? "Search images"
              : "Search photographers"}
            title={$root}
            bind:value={$search}
          />
        </div>
      {/if}

      <div class="group">
        {#if $selected}
          <button
            class="icon-btn"
            title="Reveal this photographer's folder in Finder"
            aria-label="Reveal this photographer's folder in Finder"
            onclick={() => revealInFinder(`${$root}/${$selected!.relPath}`).catch(() => {})}
          >
            <FolderOpen size={15} aria-hidden="true" />
          </button>
        {:else}
          <div class="seg" role="group" aria-label="Root view">
            <button
              class:active={$rootView === "photographers"}
              type="button"
              aria-pressed={$rootView === "photographers"}
              title="Photographers"
              aria-label="Photographers"
              onclick={() => rootView.set("photographers")}
            ><SquareUser size={15} aria-hidden="true" /></button>
            <button
              class:active={$rootView === "images"}
              type="button"
              aria-pressed={$rootView === "images"}
              title="All images"
              aria-label="All images"
              onclick={() => rootView.set("images")}
            ><Image size={15} aria-hidden="true" /></button>
          </div>
          <button
            class="icon-btn"
            onclick={change}
            title="Change folder…"
            aria-label="Change folder…"
          >
            <Folder size={15} aria-hidden="true" />
          </button>
        {/if}
        <div class="settings-wrap">
          <button
            class="icon-btn"
            class:active={settingsOpen}
            title="View settings"
            aria-label="View settings"
            aria-expanded={settingsOpen}
            onclick={() => (settingsOpen = !settingsOpen)}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
          </button>
          {#if settingsOpen}
            <div class="settings-popover" role="dialog" aria-label="View settings">
              {#if $openIndex === null}
                <div class="setting-row">
                  <span class="setting-label">Image size</span>
                  <TileSizeSlider view={activeView} />
                </div>
              {/if}
              <div class="setting-row">
                <span class="setting-label">Spacing</span>
                <div class="setting-slider">
                  <input
                    type="range"
                    min={GRID_GAP_MIN}
                    max={GRID_GAP_MAX}
                    step={GRID_GAP_STEP}
                    value={$gridGap}
                    aria-label="Image spacing"
                    oninput={(e) => gridGap.set(+(e.currentTarget as HTMLInputElement).value)}
                    onchange={(e) => setGridGap(+(e.currentTarget as HTMLInputElement).value)}
                  />
                  <span class="setting-value">{$gridGap}px</span>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
     </div>
    </header>
    {#if $selected}
      <PhotographerView root={$root!} photographer={$selected} />
    {:else if $rootView === "images"}
      <AllImagesView root={$root!} />
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

  /* Loaded shell: a floating header over a scrolling grid. Fills #app's flex
     column; min-height: 0 lets it stay within that track so the grid scrolls
     rather than the whole shell growing. */
  .shell {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* Positioning context for the absolutely-placed bar that floats over the
       scrolling content below. Fills the whole window so the grid scrolls right
       up under the bar, traffic-light strip included. */
    position: relative;
  }

  .bar {
    /* Controls row + optional tabs row stacked into one frosted surface. */
    display: flex;
    flex-direction: column;
    /* +3px over the base gap to separate the tab row from the controls row. */
    gap: calc(0.4rem + 3px);
    /* Reaches the window's top edge; the title strip below reserves the
       traffic-light clearance so the controls row clears them. +4px nudge down
       to line the rows up with the OS traffic lights. */
    padding: calc(0.4rem + 4px) 1rem 0.5rem;
    /* Floats over the content so the grid scrolls beneath it (out of sight,
       behind this opaque bar). */
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 20;
    /* One opaque surface for both the controls and tab rows. */
    background: var(--chrome-bg);
    /* Separates the bar from the grid scrolling beneath it. */
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    /* Chrome, not content: the bar's labels (path, photographer name) shouldn't
       be selectable like body text. -webkit- for the macOS WKWebView. */
    -webkit-user-select: none;
    user-select: none;
  }

  /* The controls cluster: nav buttons + search/name + actions, one even row. */
  /* Top strip beside the OS traffic lights; padding-left clears their cluster.
     min-height reserves the clearance so the controls row below sits under
     them even when the strip is empty. */
  .title-strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-left: 72px;
    min-height: 30px;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Filter tabs, in the title strip beside the traffic lights (no own
     background — the bar's). */
  .tabs {
    flex: none;
    display: flex;
    gap: 0.4rem;
  }

  .tab {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.3rem 0.7rem;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--fg-dim);
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .tab:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--fg);
  }

  .tab.active {
    background: rgba(255, 255, 255, 0.14);
    color: var(--fg);
  }

  .count {
    font-size: 0.78rem;
    color: var(--fg-dim);
    font-variant-numeric: tabular-nums;
  }

  .tab.active .count {
    color: rgba(255, 255, 255, 0.7);
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

  .icon-btn.active {
    background: rgba(255, 255, 255, 0.1);
    color: var(--fg);
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

  /* Click-away scrim behind the info popover (above bar). */
  .info-scrim {
    position: fixed;
    inset: 0;
    z-index: 99;
    background: transparent;
    border: none;
    padding: 0;
    cursor: default;
  }

  /* Click-away scrim for the settings popover — must sit BELOW the bar
     (z-index: 20) so the bar's stacking context stays on top and the
     popover controls remain interactive. */
  .settings-scrim {
    position: fixed;
    inset: 0;
    z-index: 19;
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

  /* Segmented toggle: two pills sharing one rounded shell, the active half
     filled. Overrides the global .bar button radius so they read as one control. */
  .seg {
    display: inline-flex;
    flex: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.4rem;
    overflow: hidden;
  }

  .seg button {
    border: none !important;
    border-radius: 0 !important;
    background: transparent;
    color: var(--fg-dim);
    white-space: nowrap;
    padding: 0.35rem 0.5rem;
    display: inline-flex;
    align-items: center;
  }

  .seg button:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--fg);
  }

  .seg button.active {
    background: rgba(255, 255, 255, 0.14);
    color: var(--fg);
  }

  .settings-wrap {
    position: relative;
    flex: none;
  }

  .settings-popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 100;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.75rem;
    background: #2a2a2a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .setting-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .setting-label {
    font-size: 0.8rem;
    color: var(--fg-dim);
    flex: none;
    width: 5.5rem;
  }

  .setting-slider {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .setting-slider input[type="range"] {
    flex: 1;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .setting-value {
    font-size: 0.78rem;
    color: var(--fg-dim);
    font-variant-numeric: tabular-nums;
    min-width: 2rem;
    text-align: right;
  }

</style>
