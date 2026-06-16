# Known Issues

Running list of known bugs and rough edges, newest first. Resolved items move to
the bottom under "Resolved".

## Open

_None._

## Resolved

### Window is not draggable
*Found: Slice 1 (skeleton). Resolved: Slice 1.*

The window couldn't be moved by dragging the `data-tauri-drag-region` strip in
`App.svelte`.

Cause confirmed: `data-tauri-drag-region` invokes the window `start_dragging`
command, which requires the `core:window:allow-start-dragging` permission.
`core:default` pulls in `core:window:default`, but that default set does **not**
include `allow-start-dragging`, so the call was silently rejected.

Fix: added `core:window:allow-start-dragging` to the permissions in
`src-tauri/capabilities/default.json`.
