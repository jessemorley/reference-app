<script lang="ts">
  import { listPhotographers } from "../ipc";
  import type { Photographer } from "../types";
  import Thumb from "./Thumb.svelte";

  let { root }: { root: string } = $props();

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
    <ul class="grid">
      {#each photographers as p (p.relPath)}
        <li class="tile">
          <div class="cover">
            <Thumb path={p.coverPath} />
          </div>
          <span class="name">{p.name}</span>
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
     grid itself sizes to its content, so its 1fr columns resolve against a
     definite width and the tiles' 4:5 height stays stable. A height-constrained
     grid can't do that — its rows collapse/shrink with the window. */
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
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .tile {
    position: relative;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
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
