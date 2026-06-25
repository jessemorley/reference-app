<script lang="ts">
  // Header control that sizes the active grid's tiles. Lives in the in-window
  // header strip; each view (root grid / photographer view) gets its own,
  // editing that view's value. Dragging updates the store live (input) so the
  // grid reflows immediately; the value is persisted only on release (change)
  // to avoid writing settings.json on every tick.
  import {
    settings,
    TILE_MIN_PX,
    TILE_MAX_PX,
    TILE_STEP_PX,
    type TileView,
  } from "../stores/settings";
  import { setTileSize } from "../ipc";
  import ZoomOut from "@lucide/svelte/icons/zoom-out";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";

  let { view }: { view: TileView } = $props();

  function onInput(e: Event) {
    const px = +(e.currentTarget as HTMLInputElement).value;
    settings.update((s) => ({ ...s, [view]: px }));
  }

  function onChange(e: Event) {
    setTileSize(view, +(e.currentTarget as HTMLInputElement).value);
  }
</script>

<label class="tile-size" title="Tile size">
  <ZoomOut size={15} aria-hidden="true" />
  <input
    type="range"
    min={TILE_MIN_PX}
    max={TILE_MAX_PX}
    step={TILE_STEP_PX}
    value={$settings[view]}
    aria-label="Tile size"
    oninput={onInput}
    onchange={onChange}
  />
  <ZoomIn size={15} aria-hidden="true" />
</label>

<style>
  .tile-size {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    flex: none;
    /* Zoom-out / zoom-in icons flanking the range as a size affordance. */
    color: var(--fg-dim);
  }

  input[type="range"] {
    width: 96px;
    accent-color: var(--accent);
    cursor: pointer;
  }
</style>
