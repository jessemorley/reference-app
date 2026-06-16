<script lang="ts">
  import { selectRoot } from "../ipc";
  import { root } from "../stores/root";

  let busy = $state(false);

  async function pick() {
    busy = true;
    try {
      const chosen = await selectRoot();
      if (chosen) root.set(chosen);
    } finally {
      busy = false;
    }
  }
</script>

<div class="firstrun">
  <h1>Reference</h1>
  <p>Select your photography folder to get started.</p>
  <button class="primary" onclick={pick} disabled={busy}>
    {busy ? "Choosing…" : "Select your photography folder"}
  </button>
</div>

<style>
  .firstrun {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    text-align: center;
    padding: 2rem;
  }

  h1 {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
  }

  p {
    margin: 0 0 0.75rem;
    color: var(--fg-dim);
  }
</style>
