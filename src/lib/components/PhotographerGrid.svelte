<script lang="ts">
  import { listPhotographers } from "../ipc";
  import type { Photographer } from "../types";
  import { settings } from "../stores/settings";
  import Thumb from "./Thumb.svelte";

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
</script>

<div class="scroller">
  {#if error}
    <p class="state">Couldn't read this folder: {error}</p>
  {:else if photographers === null}
    <p class="state">Scanning…</p>
  {:else if photographers.length === 0}
    <p class="state">No photographers with images in this folder.</p>
  {:else}
    <ul class="grid" style="--tile-min: {$settings.root}px">
      {#each photographers as p (p.relPath)}
        <li>
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
  }

  /* minmax(--tile-min, 1fr) so full rows fill edge-to-edge (only the last,
     partial row leaves space on the right). The trade-off: 1fr equalises every
     column to width/N, so the slider resizes tiles in discrete steps as the
     column count flips, not continuously — at a fixed window width you can have
     a perfect fill OR continuous resize, not both, and we chose fill. */
  .grid {
    list-style: none;
    margin: 0;
    padding: 1rem;
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
    border-radius: 0;
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
    width: 100%;
    aspect-ratio: 4 / 5;
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
