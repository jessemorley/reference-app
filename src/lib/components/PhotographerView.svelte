<script lang="ts">
  // One Photographer's images as a flattened grid with Category filter tabs.
  // Loads via list_images on mount and whenever the selected photographer
  // changes. Tabs are synthesised from the real Categories: "All" first, then
  // Categories (backend-sorted), then "Uncategorised" — the last only when
  // loose images and ≥1 real Category coexist. When everything is loose there's
  // no tab bar at all. Clicking an image is wired in Slice 5 (the viewer).
  import { listImages } from "../ipc";
  import type { Category, Photographer, RefImage } from "../types";
  import { activeTab, ALL_TAB, UNCATEGORISED_TAB } from "../stores/navigation";
  import Thumb from "./Thumb.svelte";

  let { root, photographer }: { root: string; photographer: Photographer } =
    $props();

  let categories = $state<Category[]>([]);
  let images = $state<RefImage[] | null>(null);
  let error = $state<string | null>(null);

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
</script>

<div class="view">
  {#if error}
    <p class="state">Couldn't read this photographer: {error}</p>
  {:else if images === null}
    <p class="state">Loading…</p>
  {:else if images.length === 0}
    <p class="state">No images in this photographer's folder.</p>
  {:else}
    {#if tabs.length > 0}
      <nav class="tabs" aria-label="Categories">
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

    <div class="scroller">
      <ul class="grid">
        {#each shown as img (img.path)}
          <li class="cell">
            <Thumb path={img.path} alt={img.name} />
          </li>
        {/each}
      </ul>
    </div>
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
  }

  .state {
    margin: 0;
    padding: 2rem;
    text-align: center;
    color: var(--fg-dim);
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

  .grid {
    list-style: none;
    margin: 0;
    padding: 1rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.6rem;
  }

  .cell {
    aspect-ratio: 4 / 5;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
  }
</style>
