# "L" is Rec. 709 luma on the sRGB-encoded bytes, not linear luminance

The L value the Eyedropper reports (and the L channel the Slice-8 histogram
computes) is `round(0.2126·R + 0.7152·G + 0.0722·B)` applied directly to the
**gamma-encoded sRGB 8-bit channels** — i.e. luma (Y′), in the same 0–255
encoding as R/G/B — *not* relative luminance derived by first linearizing each
channel. We chose this so L reads as a fourth channel alongside R/G/B in the
encoding the user actually sees, with no per-pixel linearization, and so the
eyedropper readout and the histogram's L channel are defined identically (the
histogram's live hover-line tracks the eyedropper value, so the two must agree).

## Considered Options

- **Linearized relative luminance** (un-gamma each channel, weight, the result is
  physically-linear luminance). Rejected for v1: it diverges from the R/G/B bytes
  shown beside it (a mid-grey would read a surprising L), costs a per-pixel
  transform, and this is a colour-judgement tool, not a photometry instrument.

## Consequences

- L is perceptual-ish luma, not physical luminance — fine for judging relative
  tonal weight, not a calibrated measurement.
- Slice 8's `compute_histogram` **must** use this exact formula for its L channel,
  or the histogram hover-line won't line up with the readout.
