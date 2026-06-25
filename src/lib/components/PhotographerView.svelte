<script lang="ts">
  // One Photographer's images as a flattened grid with Category filter tabs.
  // Loads via list_images on mount and whenever the selected photographer
  // changes. Tabs are synthesised from the real Categories: "All" first, then
  // Categories (backend-sorted), then "Uncategorised" — the last only when
  // loose images and ≥1 real Category coexist. When everything is loose there's
  // no tab bar at all. Clicking an image is wired in Slice 5 (the viewer).
  import { untrack } from "svelte";
  import { listImages, setCover, revealInFinder } from "../ipc";
  import type { Category, Photographer, RefImage } from "../types";
  import {
    activeTab,
    ALL_TAB,
    UNCATEGORISED_TAB,
    refreshSignal,
    selected,
    openIndex,
  } from "../stores/navigation";
  import { settings } from "../stores/settings";
  import Thumb from "./Thumb.svelte";
  import Viewer from "./Viewer.svelte";

  let { root, photographer }: { root: string; photographer: Photographer } =
    $props();

  let categories = $state<Category[]>([]);
  let images = $state<RefImage[] | null>(null);
  let error = $state<string | null>(null);

  // Which image is open in the Viewer lives in the navigation store
  // (`openIndex`) so the header's back button can close it — opening an image is
  // the third (deepest) level below the photographer view.

  // The effective cover image and whether it's a user pin — seeded from the
  // photographer prop, updated locally on a set/reset so the tile menu reflects
  // the change before the next root-grid rescan (Slice 10). After a reset we
  // can't recompute the alphabetical default here, so coverPath goes null —
  // tiles then all read "Set as cover" until the grid is re-scanned (acceptable;
  // there's no cover badge, the state lives only in the menu).
  let coverPath = $state<string | null>(null);
  let pinned = $state(false);

  // (Re)load on Root/photographer change. Reset the active tab to "All" so we
  // never land on a Category the new photographer lacks. The cancel flag drops
  // a slow load whose target has since been replaced.
  $effect(() => {
    const r = root;
    const relPath = photographer.relPath;
    let cancelled = false;
    images = null;
    error = null;
    categories = [];
    activeTab.set(ALL_TAB);
    openIndex.set(null); // close any open Viewer when the photographer changes
    menu = null;
    coverPath = photographer.coverPath;
    pinned = photographer.pinned;

    listImages(r, relPath)
      .then((res) => {
        if (cancelled) return;
        categories = res.categories;
        images = res.images;
      })
      .catch((e) => {
        if (!cancelled) error = e instanceof Error ? e.message : String(e);
      });

    return () => {
      cancelled = true;
    };
  });

  let looseCount = $derived(
    (images ?? []).filter((i) => i.category === null).length
  );

  type Tab = { key: string; label: string; count: number };
  let tabs = $derived.by<Tab[]>(() => {
    // No tab bar until there's at least one real Category to filter by.
    if (images === null || categories.length === 0) return [];
    const t: Tab[] = [{ key: ALL_TAB, label: ALL_TAB, count: images.length }];
    for (const c of categories) {
      t.push({ key: c.name, label: c.name, count: c.count });
    }
    if (looseCount > 0) {
      t.push({ key: UNCATEGORISED_TAB, label: UNCATEGORISED_TAB, count: looseCount });
    }
    return t;
  });

  let shown = $derived.by<RefImage[]>(() => {
    const all = images ?? [];
    switch ($activeTab) {
      case ALL_TAB:
        return all;
      case UNCATEGORISED_TAB:
        return all.filter((i) => i.category === null);
      default:
        return all.filter((i) => i.category === $activeTab);
    }
  });

  // Silent re-scan on ⌘R / focus return (Slice 10): swap the images in place
  // without nulling them (no "Loading…" flash, scroll preserved). untrack keeps
  // root/photographer out of the deps — only the bumped signal retriggers it.
  // An empty result means the folder was emptied/removed (the root grid hides
  // image-less folders), so fall back to the grid.
  $effect(() => {
    if ($refreshSignal === 0) return;
    untrack(() => {
      listImages(root, photographer.relPath)
        .then((res) => {
          if (res.images.length === 0) {
            selected.set(null);
            return;
          }
          categories = res.categories;
          images = res.images;
        })
        .catch(() => {});
    });
  });

  // Right-click an image tile → cover + reveal menu, positioned within the view.
  let viewEl!: HTMLDivElement;
  let menu = $state<{ x: number; y: number; img: RefImage } | null>(null);
  const MENU_W = 200;
  const MENU_H = 96;
  function openMenu(e: MouseEvent, img: RefImage) {
    e.preventDefault();
    const box = viewEl.getBoundingClientRect();
    const x = Math.min(e.clientX - box.left, Math.max(0, box.width - MENU_W));
    const y = Math.min(e.clientY - box.top, Math.max(0, box.height - MENU_H));
    menu = { x, y, img };
  }
  // The cover menu item's three states (IMPLEMENTATION §10): the pinned tile can
  // reset, an un-pinned default cover is shown disabled, everything else can pin.
  function coverItem(img: RefImage) {
    if (img.path === coverPath && pinned) {
      return { label: "Reset to default cover", disabled: false, reset: true };
    }
    if (img.path === coverPath) {
      return { label: "Current cover", disabled: true, reset: false };
    }
    return { label: "Set as cover", disabled: false, reset: false };
  }
  function chooseCover(img: RefImage, reset: boolean) {
    if (reset) {
      void setCover(photographer.relPath, null);
      coverPath = null;
      pinned = false;
    } else {
      void setCover(photographer.relPath, img.path);
      coverPath = img.path;
      pinned = true;
    }
    menu = null;
  }
</script>

<div class="view" bind:this={viewEl}>
  {#if error}
    <p class="state">Couldn't read this photographer: {error}</p>
  {:else if images === null}
    <p class="state">Loading…</p>
  {:else if images.length === 0}
    <p class="state">No images in this photographer's folder.</p>
  {:else}
    {#if tabs.length > 0}
      <nav class="tabs" class:occluded={$openIndex !== null} aria-label="Categories">
        {#each tabs as t (t.key)}
          <button
            class="tab"
            class:active={$activeTab === t.key}
            type="button"
            aria-pressed={$activeTab === t.key}
            onclick={() => activeTab.set(t.key)}
          >
            {t.label}<span class="count">{t.count}</span>
          </button>
        {/each}
      </nav>
    {/if}

    <div class="scroller" class:occluded={$openIndex !== null}>
      <ul class="grid" style="--tile-min: {$settings.photographer}px">
        {#each shown as img, i (img.path)}
          <li class="cell">
            <button
              class="open"
              type="button"
              onclick={() => openIndex.set(i)}
              oncontextmenu={(e) => openMenu(e, img)}
            >
              <Thumb path={img.path} alt={img.name} />
            </button>
          </li>
        {/each}
      </ul>
    </div>

    {#if $openIndex !== null}
      <Viewer
        images={shown}
        index={$openIndex}
        onpage={(i) => openIndex.set(i)}
        onclose={() => openIndex.set(null)}
      />
    {/if}
  {/if}

  {#if menu}
    {@const cover = coverItem(menu.img)}
    <!-- Click-away catcher closes the menu; sits under it (Viewer's pattern). -->
    <button
      class="scrim"
      type="button"
      tabindex="-1"
      aria-hidden="true"
      onclick={() => (menu = null)}
      oncontextmenu={(e) => {
        e.preventDefault();
        menu = null;
      }}
    ></button>
    <ul class="menu" role="menu" style="left: {menu.x}px; top: {menu.y}px">
      <li role="none">
        <button
          class="item"
          type="button"
          role="menuitem"
          disabled={cover.disabled}
          onclick={() => chooseCover(menu!.img, cover.reset)}
        >
          {cover.label}
        </button>
      </li>
      <li role="none">
        <button
          class="item"
          type="button"
          role="menuitem"
          onclick={() => {
            void revealInFinder(menu!.img.path);
            menu = null;
          }}
        >
          Reveal in Finder
        </button>
      </li>
    </ul>
  {/if}
</div>

<style>
  /* Fills the shell's 1fr row as a column: tabs sized to content, the grid
     scroller takes the rest. min-height: 0 keeps the scroll inside this track. */
  .view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    /* Positioning context for the Viewer overlay, which fills this content
       region (below the app header) until expanded to the full window. */
    position: relative;
  }

  .state {
    margin: 0;
    padding: 2rem;
    text-align: center;
    color: var(--fg-dim);
  }

  /* While the Viewer overlay is open it fully covers the content region, so the
     grid (and tabs) behind it are hidden. Without this, a thumbnail row could
     bleed through the 1px sub-pixel seam at the header/content boundary. Kept in
     layout (visibility, not display) so the scroll position is preserved when the
     Viewer closes. */
  .occluded {
    visibility: hidden;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  /* Reset the global button chrome into a flat pill; the active tab fills in. */
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

  /* Scroll the grid here (not the grid itself) so the grid sizes to its content
     and its square cells resolve against a definite column width — same pattern
     as the photographer grid. */
  .scroller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* minmax(--tile-min, 1fr) so full rows fill edge-to-edge (only the last,
     partial row leaves space on the right). Trade-off: 1fr equalises every
     column to width/N, so the slider resizes tiles in discrete steps as the
     column count flips, not continuously — fill and continuous resize can't
     coexist at a fixed width, and we chose fill. */
  .grid {
    list-style: none;
    margin: 0;
    padding: 1rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--tile-min, 160px), 1fr));
    gap: 0.6rem;
  }

  .cell {
    aspect-ratio: 4 / 5;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
  }

  /* The whole tile is the open affordance; reset button chrome to a bare,
     keyboard-reachable frame (same precedent as PhotographerGrid tiles). */
  .open {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }

  .open:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: -2px;
  }

  /* Tile right-click menu — same dark-glass treatment as the Viewer's backdrop
     menu. Transparent full-cover scrim dismisses it on any click. */
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
    min-width: 11rem;
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

  .item:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }

  .item:disabled {
    color: var(--fg-dim);
    cursor: default;
  }
</style>
