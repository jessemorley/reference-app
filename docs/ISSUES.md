# Known Issues

Running list of known bugs and rough edges, newest first. Resolved items move to
the bottom under "Resolved".

## Open

### Window is not draggable
*Found: Slice 1 (skeleton).*

The window can't be moved by dragging. The hidden-inset titlebar relies on a
36px `data-tauri-drag-region` strip at the top of `App.svelte`, but dragging it
does nothing.

Likely cause: `data-tauri-drag-region` calls the window `start_dragging` API,
which needs the `core:window:allow-start-dragging` permission — not guaranteed by
`core:default` in `src-tauri/capabilities/default.json`. Worth verifying the
strip's height/stacking too (it must sit above content and not be overlapped).

## Resolved

_None yet._
