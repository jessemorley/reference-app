# Known Issues

Running list of known bugs and rough edges, newest first. Resolved items move to
the bottom under "Resolved".

## Open

### 1. Window not draggable when image maximised

### 2. in the 1px border between menubar and main view (in single image view), the photographer grid is visible through the gap

## Resolved

### BG Colour (backdrop) menu clipped by the Inspector
*Found: Slice 6 (Inspector shell). Resolved: Slice 6.*

The right-click backdrop ("BG Colour") menu rendered inside the image surround,
which clips overflow. With the Inspector open, a menu opened near the surround's
right edge was cut off at the Inspector column instead of showing over it. Moved
the menu (and its click-away scrim) up to the Viewer level so it lays out against
the Viewer box and renders over the Inspector, clamped to stay on-screen.

### Menubar text is highlightable
*Found: Slice 6 (Inspector shell). Resolved: Slice 6.*

The header bar's labels (root path, photographer name) could be drag-selected
like body text. Added `user-select: none` (with `-webkit-` for the macOS
WKWebView) to `.bar` so the chrome behaves like chrome.

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
