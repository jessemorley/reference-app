# Reference App

A macOS desktop app for browsing and visually analysing photographers' reference
images. The user curates a folder tree on disk; the app presents it as a browsable
grid with per-image analysis tools (eyedropper, histogram, colour-scheme extractor).

## Language

**Photography Root**:
The single top-level folder the user selects. Contains one subfolder per
photographer and nothing else of interest (loose files are ignored).
_Avoid_: library, database, collection.

**Photographer**:
A folder directly inside the Photography Root, named after a photographer. Holds
that photographer's reference images, optionally grouped into Categories.

**Category**:
A subfolder inside a Photographer folder representing a thematic grouping of
reference images (e.g. `portraits`, `still-life`). Surfaced as a filter tab in the
photographer view, not as its own tile. Exactly one level deep — categories do not
nest.
_Avoid_: set, album, collection, genre.

**Reference image**:
An image file belonging to a Photographer, either inside a Category or loose
directly in the Photographer folder. The unit that gets opened and analysed.
_Avoid_: photo, picture, asset.

**Cover image**:
The single Reference image shown on a Photographer's tile in the root grid. Defaults
to the first image alphabetically; the user can pin a specific image as the cover.
_Avoid_: thumbnail, preview (those mean the small grid renditions, not the chosen one).

**Viewer**:
The single-image surface: one Reference image shown full-resolution against a
Backdrop for close inspection and analysis. Entered from the photographer view by
opening a Reference image, and paged left/right through the images of the active
filter tab. Has two size states: **Windowed** (fills the content region, below the
header) and **Expanded** (fills the whole window, over the header and titlebar).
Expanded is ephemeral — every open starts Windowed.
_Avoid_: lightbox, modal, preview. For the size states, _avoid_: "maximised"
(use Expanded), "fullscreen" (that's the OS state, not this).

**Inspector**:
The panel of analysis tools for the open Reference image, shown alongside the
Viewer. Hosts the Eyedropper readout, the Colour-scheme extractor's palette bar,
and the histogram. Bound to the Viewer — it only exists while an image is open —
but whether it is shown is a durable, global preference.
_Avoid_: panel, sidebar, analysis pane.

**Eyedropper**:
The hover tool that reports the pixel under the cursor as R, G, B and L. **L** is
Rec. 709 *luma* — the weighted sum of the sRGB-encoded channels (0–255), in the
same encoding as R/G/B — not linear luminance (see ADR-0003). Runs locally
against a canvas for zero-latency readout.
_Avoid_: "luminosity" unqualified (it's luma on the gamma-encoded bytes, a
specific choice, not physical luminance).

**Colour-scheme extractor**:
The tool that derives a small palette of dominant colours from a Reference image.
_Avoid_: palette generator, swatches.

**Backdrop**:
The neutral fill behind the image in the viewer, user-settable to black, white or
grey so colour can be judged against a controlled surround. Distinct from the app's
fixed chrome — there is no light/dark theme.
_Avoid_: background, theme.

## Flagged ambiguities

- **Preview vs Cover**: "Cover image" is the user-facing chosen tile image; "thumbnail"
  is any downscaled grid rendition. Don't use "preview" for either.
