<script lang="ts">
  import { onMount } from "svelte";
  import { getRoot, selectRoot } from "./lib/ipc";
  import { root } from "./lib/stores/root";
  import RootPicker from "./lib/components/RootPicker.svelte";

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
  <!-- Slice 1 placeholder. Slice 2 replaces this with the photographer grid. -->
  <main>
    <p class="dim">Photography Root</p>
    <p class="path">{$root}</p>
    <button onclick={change}>Change folder…</button>
  </main>
{/if}

<style>
  .center,
  main {
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

  .path {
    margin: 0 0 0.75rem;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.95rem;
  }
</style>
