<script lang="ts">
  import { onMount } from "svelte";
  import { getRoot, selectRoot } from "./lib/ipc";
  import { root } from "./lib/stores/root";
  import RootPicker from "./lib/components/RootPicker.svelte";
  import PhotographerGrid from "./lib/components/PhotographerGrid.svelte";

  // null = checked, no root yet; undefined = still checking.
  let ready = $state(false);

  onMount(async () => {
    root.set(await getRoot());
    ready = true;
  });

  async function change() {
    const chosen = await selectRoot();
    if (chosen) root.set(chosen);
  }
</script>

<!-- Stands in for the hidden-inset titlebar; drag anywhere along the top. -->
<div class="titlebar" data-tauri-drag-region></div>

{#if !ready}
  <div class="center"><span class="dim">Loading…</span></div>
{:else if $root === null}
  <RootPicker />
{:else}
  <div class="shell">
    <header class="bar">
      <span class="path" title={$root}>{$root}</span>
      <button onclick={change}>Change folder…</button>
    </header>
    <PhotographerGrid root={$root!} />
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
  }

  .path {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.85rem;
    color: var(--fg-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bar button {
    flex: none;
  }
</style>
