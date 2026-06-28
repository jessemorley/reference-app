<script lang="ts">
  import { untrack } from "svelte";
  import { listPhotographers } from "../ipc";
  import type { Photographer } from "../types";
  import { settings } from "../stores/settings";
  import { search, refreshSignal } from "../stores/navigation";
  import Thumb from "./Thumb.svelte";
  import { gridIn } from "../motion";

  let {
    root,
    onselect,
  }: { root: string; onselect: (photographer: Photographer) => void } =
    $props();

  let photographers = $state<Photographer[] | null>(null);
  let error = $state<string | null>(null);

  // Re-scan whenever the Root changes (initial mount and "Change folder…").
  // The cancel flag drops a slow scan whose Root has since been replaced.
  $effect(() => {
    const current = root;
    let cancelled = false;
    photographers = null;
    error = null;

    listPhotographers(current)
      .then((list) => {
        if (!cancelled) photographers = list;
      })
      .catch((e) => {
        if (!cancelled) error = e instanceof Error ? e.message : String(e);
      });

    return () => {
      cancelled = true;
    };
  });

  // Silent re-scan on ⌘R / focus return (Slice 10): re-fetch and swap the list
  // in place without nulling it, so the grid keeps its content (and scroll)
  // rather than flashing "Scanning…". untrack keeps `root` out of this effect's
  // deps — only the bumped signal should retrigger it, not a folder change
  // (that's the loading effect's job). The initial 0 is a no-op.
  $effect(() => {
    if ($refreshSignal === 0) return;
    untrack(() => {
      listPhotographers(root)
        .then((list) => {
          photographers = list;
        })
        .catch(() => {});
    });
  });

  // Live, case-insensitive substring filter over the loaded list (no IPC).
  let shown = $derived.by(() => {
    const list = photographers ?? [];
    const q = $search.trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  });
</script>

<div class="scroller">
  {#if error}
    <p class="state">Couldn't read this folder: {error}</p>
  {:else if photographers === null}
    <p class="state">Scanning…</p>
  {:else if photographers.length === 0}
    <p class="state">No photographers with images in this folder.</p>
  {:else if shown.length === 0}
    <p class="state">No photographers match “{$search}”.</p>
  {:else}
    <ul class="grid" style="--tile-min: {$settings.root}px">
      {#each shown as p, i (p.relPath)}
        <li in:gridIn|global={{ index: i }}>
          <button
            class="tile"
            type="button"
            title={p.name}
            onclick={() => onselect(p)}
          >
            <div class="cover">
              <!-- Decorative: the name is shown in the overlay below and is the
                   button's accessible label, so the cover stays alt="". -->
              <Thumb path={p.coverPath} />
            </div>
            <span class="name">{p.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .state {
    margin: 0;
    padding: 2rem;
    text-align: center;
    color: var(--fg-dim);
  }

  /* The scroll container. Keeping the scroll here (not on the grid) means the
     grid itself sizes to its content, so the tiles' 4:5 height derives from a
     definite column width. A height-constrained grid can't do that — its rows
     collapse/shrink with the window. */
  .scroller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* First row clears the floating menu bar; the grid scrolls under it. */
    margin-top: var(--bar-h, 0);
  }

  /* minmax(--tile-min, 1fr) so full rows fill edge-to-edge (only the last,
     partial row leaves space on the right). The trade-off: 1fr equalises every
     column to width/N, so the slider resizes tiles in discrete steps as the
     column count flips, not continuously — at a fixed window width you can have
     a perfect fill OR continuous resize, not both, and we chose fill. */
  .grid {
    list-style: none;
    margin: 0;
    padding: var(--grid-padding, 8px);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--tile-min, 200px), 1fr));
    gap: 1rem;
  }

  /* The tile is a button so selecting a photographer is keyboard-reachable and
     announced as actionable; reset the global button chrome back to a bare,
     full-width block so the cover + name overlay layout is unchanged. */
  .tile {
    display: block;
    position: relative;
    width: 100%;
    padding: 0;
    border: none;
    border-radius: 6px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    text-align: left;
    transition: none;
  }

  .tile:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .tile:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* 4:5 portrait. The ratio lives on this cover box (not the grid-item tile) so
     its height derives from the column width in normal flow — a grid item's
     aspect-ratio height isn't transferred into auto row tracks, which collapses
     the rows and makes covers overflow. The Thumb inside fills this box. */
  .cover {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 5;
    overflow: hidden;
  }

  /* Resting dim that fades out on hover, with a subtle zoom of the cover —
     cropped by overflow:hidden. The .name gradient sits above this (later in
     the DOM) so the label stays readable while the dim fades. Hover-only. */
  .cover::after {
    content: "";
    position: absolute;
    inset: 0;
    background: #000;
    opacity: 0.1;
    pointer-events: none;
    transition: opacity 300ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .cover :global(img),
  .cover :global(.placeholder) {
    transform-origin: center;
    transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tile:hover .cover::after {
    opacity: 0;
  }

  .tile:hover .cover :global(img),
  .tile:hover .cover :global(.placeholder) {
    transform: scale(1.04);
  }

  /* The growing transform is the motion-sickness trigger; keep the overlay fade. */
  @media (prefers-reduced-motion: reduce) {
    .cover :global(img),
    .cover :global(.placeholder) {
      transition: none;
    }
    .tile:hover .cover :global(img),
    .tile:hover .cover :global(.placeholder) {
      transform: none;
    }
  }

  .name {
    position: absolute;
    inset: auto 0 0 0;
    padding: 0.85rem 0.6rem 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: #fff;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    /* Keep long names on one line; the gradient anchors them readably. */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
