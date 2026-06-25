# Known Issues

Running list of known bugs and rough edges, newest first. Resolved items move to
the bottom under "Resolved".

## Open

### 1. Window not draggable when image maximised

## Todo

### Root view
- Hide folder location; instead show forward/back buttons (Also replace the "< Photographers" button from Photographer view)
  
### Colour Palette
- Automatically-select number of colours for palette (suggest a default k)
- Add button to show palette anchor points on the image which can be dragged to new values by the user
- Add option to show palette on colour wheel

### Photographer View
- Add button to open folder in finder

### Inspector Panel
- Make inspector panel resizable (max width 550px)

### Value
- Allow click to freeze Value values and add a new live value row on top ()
- Add hex value inside swatch square (make rounded rectangle to fit)

### Image-size slider
- Hide on single-image view
- Restyle to match slider-example.png

### Histogram
- Change from three-column grid overlay to four
- Add outline colour to luma area

## Resolved

### Photographer grid bleeds through the header/viewer seam
*Found: Slice 6 (Inspector shell). Resolved: Slice 6.*

In single-image view, a 1px sliver of the photographer grid was visible through
the sub-pixel seam between the menubar and the content region. The grid sits
directly behind the Viewer overlay (both fill `.view`), so at a fractional-pixel
boundary a thumbnail row bled through. Hid the grid and tabs behind the open
Viewer with `visibility: hidden` (kept in layout so scroll position survives),
so the occluded content isn't painted and can't leak.

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
