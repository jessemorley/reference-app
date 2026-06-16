# Image analysis is split: Canvas for per-pixel hover, Rust for batch

The Eyedropper reads the pixel under the cursor in the web layer, sampling a
source-resolution `<canvas>` locally, while the histogram and colour-scheme
extractor run in Rust (the `image` crate, off the UI thread) and return their
results over IPC. We chose this split because per-pixel hover demands
zero-latency reads — a Tauri IPC round-trip per `mousemove` would feel laggy —
whereas the histogram and palette are batch computations that benefit from
Rust's speed and from not blocking the UI thread on large images.

## Considered Options

- **All analysis in the web layer (Canvas/JS)**, porting the old Electron code
  verbatim. Rejected: the colour-scheme extractor and full-image histogram can
  jank the UI thread on large images, and holding full-res `ImageData` for every
  open image is memory-heavy.
- **All analysis in Rust, including hover via IPC.** Rejected: an IPC round-trip
  on every mouse move is too slow for a smooth eyedropper readout.

## Consequences

- The image is decoded in two places: Canvas for hover, Rust for batch. Accepted
  as the cost of a snappy eyedropper plus non-blocking batch analysis.
- The eyedropper must map cursor coordinates to *source* pixels (not the
  upscaled on-screen pixels) so readings stay correct under zoom/pan.
