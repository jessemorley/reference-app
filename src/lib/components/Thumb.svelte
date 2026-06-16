<script lang="ts">
  // Loads a cached thumbnail for an image path, showing a placeholder until it
  // resolves so grids of tiles fill in progressively rather than blocking on
  // full-res decode. Reused by the photographer grid (covers) and, from Slice 4,
  // the per-photographer image grid. Fills its container; the parent owns the
  // aspect-ratio box.
  import { ensureThumb } from "../ipc";

  let { path, alt = "" }: { path: string | null; alt?: string } = $props();

  let src = $state<string | null>(null);

  // Re-resolve whenever `path` changes; drop a stale request whose path has been
  // replaced. A failed thumbnail (e.g. HEIC, which `image` can't decode) leaves
  // the placeholder in place rather than surfacing an error per tile.
  $effect(() => {
    const current = path;
    src = null;
    if (!current) return;

    let cancelled = false;
    ensureThumb(current)
      .then((url) => {
        if (!cancelled) src = url;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  });
</script>

{#if src}
  <img {src} {alt} loading="lazy" />
{:else}
  <div class="placeholder" aria-hidden="true"></div>
{/if}

<style>
  img,
  .placeholder {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder {
    background: rgba(255, 255, 255, 0.04);
  }
</style>
