<script lang="ts">
  // The all-images root grid: every image across all Photographers, flattened,
  // with Category tabs merged by name. Structurally the per-Photographer view
  // (PhotographerView) minus cover pins, plus a photographer-name overlay on each
  // tile that clicks through to that Photographer. Loads via list_all_images on
  // mount and on Root change; reuses Thumb + Viewer.
  import { untrack } from "svelte";
  import { listAllImages, revealInFinder } from "../ipc";
  import type { Category, RefImage } from "../types";
  import {
    activeTab,
    ALL_TAB,
    UNCATEGORISED_TAB,
    refreshSignal,
    openIndex,
  } from "../stores/navigation";
  import { settings } from "../stores/settings";
  import Thumb from "./Thumb.svelte";
  import Viewer from "./Viewer.svelte";

  let { root }: { root: string } = $props();

  let categories = $state<Category[]>([]);
  let images = $state<RefImage[] | null>(null);
  let error = $state<string | null>(null);

  // (Re)load on Root change. Reset the active tab to "All" so we never land on a
  // Category the new Root lacks. The cancel flag drops a slow load whose Root has
  // since been replaced.
  $effect(() => {
    const r = root;
    let cancelled = false;
    images = null;
    error = null;
    categories = [];
    activeTab.set(ALL_TAB);
    openIndex.set(null);
    menu = null;

    listAllImages(r)
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

  // Silent re-scan on ⌘R / focus return: swap images in place without nulling
  // them (no "Loading…" flash, scroll preserved). untrack keeps root out of the
  // deps — only the bumped signal retriggers it.
  $effect(() => {
    if ($refreshSignal === 0) return;
    untrack(() => {
      listAllImages(root)
        .then((res) => {
          categories = res.categories;
          images = res.images;
        })
        .catch(() => {});
    });
  });

  // Right-click an image tile → reveal-in-Finder menu, positioned within the view.
  let viewEl!: HTMLDivElement;
  let menu = $state<{ x: number; y: number; img: RefImage } | null>(null);
  const MENU_W = 200;
  const MENU_H = 48;
  function openMenu(e: MouseEvent, img: RefImage) {
    e.preventDefault();
    const box = viewEl.getBoundingClientRect();
    const x = Math.min(e.clientX - box.left, Math.max(0, box.width - MENU_W));
    const y = Math.min(e.clientY - box.top, Math.max(0, box.height - MENU_H));
    menu = { x, y, img };
  }
</script>

<div class="view" bind:this={viewEl}>
  {#if error}
    <p class="state">Couldn't read this folder: {error}</p>
  {:else if images === null}
    <p class="state">Loading…</p>
  {:else if images.length === 0}
    <p class="state">No images in this folder.</p>
  {:else}
    {#if tabs.length > 0}
      <nav class="tabs" class:occluded={$openIndex !== null} aria-label="Categories">
        {#each tabs as t (t.key)}
          <button
            class="tab"
            class:active={$activeTab === t.key}
            type="button"
            aria-pressed={$activeTab === t.key}
            onclick={() => { activeTab.set(t.key); openIndex.set(null); }}
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
    <!-- Click-away catcher closes the menu; sits under it. -->
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
          onclick={() => {
            void revealInFinder(menu!.img.path).catch(() => {});
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
  /* Mirrors PhotographerView's layout: tabs sized to content, grid scroller takes
     the rest; positioning context for the Viewer overlay. */
  .view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .state {
    margin: 0;
    padding: 2rem;
    text-align: center;
    color: var(--fg-dim);
  }

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

  .scroller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 1rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--tile-min, 160px), 1fr));
    gap: 0.6rem;
  }

  .cell {
    position: relative;
    aspect-ratio: 4 / 5;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
  }

  .cell::after {
    content: "";
    position: absolute;
    inset: 0;
    background: #000;
    opacity: 0.1;
    pointer-events: none;
    transition: opacity 300ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .cell:hover::after {
    opacity: 0;
  }

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

  /* Tile right-click menu — same dark-glass treatment as PhotographerView. */
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

  .item:hover {
    background: rgba(255, 255, 255, 0.1);
  }
</style>
