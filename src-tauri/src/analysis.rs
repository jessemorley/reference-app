//! Batch image analysis that runs in Rust (ADR-0001): the histogram is a
//! whole-image computation, so it decodes off the UI thread and returns 256-bin
//! r/g/b/l arrays over IPC. Per-pixel hover (the eyedropper) stays in the web
//! layer; only batch work lives here.
//!
//! As with `scan.rs`/`thumbs.rs`, the pure computation (`histogram`, `luma`) is a
//! free function so it can be unit-tested; the `#[tauri::command]` is thin glue
//! that decodes and hands off to the blocking pool.

/// 256-bin counts per channel. Field names serialize to the TS `Histogram`
/// (`{ r, g, b, l }`) as-is.
#[derive(serde::Serialize)]
pub struct Histogram {
    r: Vec<u32>,
    g: Vec<u32>,
    b: Vec<u32>,
    l: Vec<u32>,
}

/// Rec. 709 luma on the sRGB-encoded bytes (ADR-0003): the weighted channel sum
/// in the same 0–255 encoding as R/G/B, *not* linearized luminance. Computed in
/// f64 to match the JS `luminance()` (eyedropper.ts) bit-for-bit, so the
/// histogram's L channel lines up with the eyedropper readout / hover line. The
/// weights sum to 1.0, so the result never exceeds 255.
fn luma(r: u8, g: u8, b: u8) -> u8 {
    (0.2126 * r as f64 + 0.7152 * g as f64 + 0.0722 * b as f64).round() as u8
}

/// Bin every pixel of `img` into per-channel 256-bin counts (one pass). Each
/// channel's bins sum to the pixel count; the L channel uses `luma`.
fn histogram(img: &image::RgbImage) -> Histogram {
    let mut r = vec![0u32; 256];
    let mut g = vec![0u32; 256];
    let mut b = vec![0u32; 256];
    let mut l = vec![0u32; 256];
    for px in img.pixels() {
        let [rr, gg, bb] = px.0;
        r[rr as usize] += 1;
        g[gg as usize] += 1;
        b[bb as usize] += 1;
        l[luma(rr, gg, bb) as usize] += 1;
    }
    Histogram { r, g, b, l }
}

/// Decode `img_path` and return its histogram. Decoding is blocking, so it runs
/// on the blocking pool (a sync command would stall the UI — see agent memory).
/// Rejects on any decode failure, including HEIC/AVIF: the `image` crate can't
/// decode those even though the viewer/eyedropper handle them natively in
/// WKWebView, so the Inspector shows an "unavailable" state on rejection.
#[tauri::command]
pub async fn compute_histogram(img_path: String) -> Result<Histogram, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&img_path)
            .map_err(|e| format!("decode {img_path}: {e}"))?
            .to_rgb8();
        Ok(histogram(&img))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    #[test]
    fn bins_sum_to_pixel_count_and_spike_at_the_colour() {
        let img = RgbImage::from_pixel(4, 5, Rgb([10, 20, 30]));
        let h = histogram(&img);
        let n = 4 * 5;
        for ch in [&h.r, &h.g, &h.b, &h.l] {
            assert_eq!(ch.iter().sum::<u32>(), n, "every pixel binned once");
        }
        // Solid colour ⇒ a single spike in each channel at its own value.
        assert_eq!(h.r[10], n);
        assert_eq!(h.g[20], n);
        assert_eq!(h.b[30], n);
    }

    #[test]
    fn luma_matches_adr_0003() {
        // round(0.2126·R + 0.7152·G + 0.0722·B) on the sRGB bytes; identical to
        // the JS luminance() so the histogram L lines up with the eyedropper.
        assert_eq!(luma(255, 0, 0), 54);
        assert_eq!(luma(0, 255, 0), 182);
        assert_eq!(luma(0, 0, 255), 18);
        assert_eq!(luma(0, 0, 0), 0);
        assert_eq!(luma(255, 255, 255), 255);
        assert_eq!(luma(127, 127, 127), 127);
    }
}
