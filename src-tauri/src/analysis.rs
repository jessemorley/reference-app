//! Batch image analysis that runs in Rust (ADR-0001): the histogram and palette
//! are whole-image computations, so they decode off the UI thread and return
//! their results over IPC. Per-pixel hover (the eyedropper) stays in the web
//! layer; only batch work lives here.
//!
//! As with `scan.rs`/`thumbs.rs`, the pure computation (`histogram`, `luma`,
//! `palette`) is a free function so it can be unit-tested; the
//! `#[tauri::command]` is thin glue that decodes and hands off to the blocking
//! pool.

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

/// One dominant colour: sRGB bytes + `#rrggbb`, plus its *salience-weighted*
/// share of the image (0..1, the swatches sum to 1). Not pure pixel area —
/// vivid pixels count for more (see `salience`), so a small bright accent reads
/// as a real, visible segment. Serializes to the TS `Swatch` as-is.
#[derive(serde::Serialize, Debug)]
pub struct Swatch {
    hex: String,
    r: u8,
    g: u8,
    b: u8,
    weight: f64,
}

/// Longest edge the palette decode is downsampled to before clustering. The
/// palette is a colour summary, not pixel-forensics, so a small sample is both
/// faster and just as representative — ~128px keeps k-means over a few thousand
/// points (instant for ~1080p references).
const PALETTE_SAMPLE: u32 = 128;
/// Lloyd iterations cap; real photos converge well before this.
const KMEANS_MAX_ITERS: usize = 32;

/// Salience boost for vivid pixels (see `salience`); 0 = pure pixel-area
/// weighting (which under-represents exactly the small saturated accents the eye
/// locks onto). A tuning knob: raise it to make bright accents claim more of the
/// bar, lower it toward a strict area histogram.
const CHROMA_BOOST: f64 = 3.0;
/// Lab chroma at which the boost saturates (~a strong sRGB primary); beyond it
/// the weight is capped so a few neon edge pixels can't dominate the palette.
const CHROMA_REF: f64 = 80.0;

/// How hard the *merge* distance (`merge_dist2`) folds shades of one hue together.
/// 0 = plain Lab Euclidean; 1 = pure hue for fully-saturated colours, so a bright
/// and a dark red (same hue, different lightness *and* saturation) fuse into one
/// swatch — freeing a `k` slot for a distinct hue like a blue accent. The fold is
/// scaled by saturation, so neutrals (black/grey/white, differing only in
/// lightness) are *not* folded and stay separate. See pallette3/pallette4.
const SHADE_FOLD: f64 = 0.85;

/// Over-segmentation factor: k-means runs with `k·OVERSEG` clusters, then the
/// closest pairs are agglomeratively merged back down to `k` (see `palette`).
/// k-means alone can't merge two seeds, so a salient highlight keeps its own
/// slot away from the body of the same object; over-segment-then-merge collapses
/// such near-duplicate shades first (two reds → one) while distinct hues, being
/// far apart, survive the merge — so the `k` swatches are genuinely different
/// colours, not shades of a few.
const PALETTE_OVERSEG: usize = 4;

/// CIELAB point (D65). Clustering happens here, not in RGB, so swatches split on
/// *perceptual* colour difference (ADR-0001 / Slice 9 spec).
type Lab = [f64; 3];

/// sRGB byte → linear-light component (the inverse companding curve).
fn srgb_to_linear(c: u8) -> f64 {
    let c = c as f64 / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// Linear-light component → sRGB byte (companding curve + clamp/round).
fn linear_to_srgb(c: f64) -> u8 {
    let c = c.clamp(0.0, 1.0);
    let v = if c <= 0.0031308 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    };
    (v * 255.0).round().clamp(0.0, 255.0) as u8
}

// D65 reference white, for the XYZ⇄Lab f/finv folds.
const XN: f64 = 0.95047;
const YN: f64 = 1.0;
const ZN: f64 = 1.08883;

fn lab_f(t: f64) -> f64 {
    const D: f64 = 6.0 / 29.0;
    if t > D * D * D {
        t.cbrt()
    } else {
        t / (3.0 * D * D) + 4.0 / 29.0
    }
}

fn lab_finv(t: f64) -> f64 {
    const D: f64 = 6.0 / 29.0;
    if t > D {
        t * t * t
    } else {
        3.0 * D * D * (t - 4.0 / 29.0)
    }
}

/// sRGB bytes → CIELAB (linearize → XYZ via the sRGB/D65 matrix → Lab).
fn rgb_to_lab([r, g, b]: [u8; 3]) -> Lab {
    let (rl, gl, bl) = (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b));
    let x = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
    let y = 0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl;
    let z = 0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl;
    let (fx, fy, fz) = (lab_f(x / XN), lab_f(y / YN), lab_f(z / ZN));
    [116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)]
}

/// CIELAB → sRGB bytes (Lab → XYZ → de-linearize through the inverse matrix).
fn lab_to_rgb([l, a, b]: Lab) -> [u8; 3] {
    let fy = (l + 16.0) / 116.0;
    let fx = fy + a / 500.0;
    let fz = fy - b / 200.0;
    let x = XN * lab_finv(fx);
    let y = YN * lab_finv(fy);
    let z = ZN * lab_finv(fz);
    let rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    let gl = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
    let bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
    [linear_to_srgb(rl), linear_to_srgb(gl), linear_to_srgb(bl)]
}

/// Plain squared Lab distance — the clustering (seeding + assignment) metric, so
/// k-means over-segments by lightness too (a highlight and the body of one object
/// land in *separate* fine clusters). The merge step (`lab_dist2_chroma`) is what
/// later recombines those shades; here we want them split so there's something to
/// merge.
fn lab_dist2(a: Lab, b: Lab) -> f64 {
    let (dl, da, db) = (a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    dl * dl + da * da + db * db
}

/// Merge-distance between two centroids (`merge_clusters`) that fuses *shades of
/// one hue* while keeping distinct hues — and distinct neutrals — apart. Splits
/// the Lab gap into lightness (ΔL), chroma-magnitude (ΔC) and hue (ΔH, via
/// `ΔH² = Δa²+Δb²−ΔC²`) parts, then shrinks ΔL and ΔC by `SHADE_FOLD` *scaled by
/// saturation*: for a saturated pair (two reds) lightness and saturation barely
/// count, so same-hue shades are the closest pair and merge first; for neutrals
/// (black/grey/white, ~0 chroma) nothing is folded, so they separate by ΔL as
/// usual. Hue always counts full, so different colours never merge.
fn merge_dist2(a: Lab, b: Lab) -> f64 {
    let dl = a[0] - b[0];
    let (da, db) = (a[1] - b[1], a[2] - b[2]);
    let ca = (a[1] * a[1] + a[2] * a[2]).sqrt();
    let cb = (b[1] * b[1] + b[2] * b[2]).sqrt();
    let dc = ca - cb;
    let dh2 = (da * da + db * db - dc * dc).max(0.0); // ΔH² (clamp float noise ≥0)
    let sat = ((ca + cb) * 0.5 / CHROMA_REF).min(1.0); // 0 neutral .. 1 saturated
    let fold = 1.0 - SHADE_FOLD * sat;
    fold * dl * dl + fold * dc * dc + dh2
}

/// Perceptual salience weight for a Lab pixel: `1 + boost·chroma`. Chroma
/// (`sqrt(a²+b²)`) is ~0 for neutrals (black/white/grey) and large for vivid
/// colour, so a saturated accent counts for several plain pixels. This is what
/// pulls a small red panel into the palette — and keeps its swatch vivid rather
/// than muddied — instead of losing every cluster to the big neutral regions.
fn salience(lab: Lab) -> f64 {
    let chroma = (lab[1] * lab[1] + lab[2] * lab[2]).sqrt();
    1.0 + CHROMA_BOOST * (chroma / CHROMA_REF).min(1.0)
}

/// Salience-weighted mean Lab of all points — the single most representative
/// colour, used as the first seed so one cluster always anchors the image's bulk.
fn weighted_mean(points: &[Lab], weights: &[f64]) -> Lab {
    let mut s = [0.0f64; 3];
    let mut w = 0.0;
    for (i, p) in points.iter().enumerate() {
        s[0] += weights[i] * p[0];
        s[1] += weights[i] * p[1];
        s[2] += weights[i] * p[2];
        w += weights[i];
    }
    [s[0] / w, s[1] / w, s[2] / w]
}

/// Greedy salience-weighted farthest-first seeding (Gonzalez): seed 0 is the
/// representative weighted mean, then each next seed is the pixel maximising
/// `weight · (distance to the nearest seed)²`. Unlike probability-proportional
/// k-means++, this *deterministically* grabs the most chromatically isolated
/// regions, so a small, vivid, hue-isolated accent (a blue lid in an otherwise
/// warm/neutral scene) reliably gets a cluster instead of being skipped by an
/// unlucky random draw. Stops early once every point already sits on a seed.
/// (Downsampling to `PALETTE_SAMPLE` first averages out lone-pixel noise, so the
/// greedy max lands on real regions, not JPEG speckle.)
fn seed_centroids(points: &[Lab], weights: &[f64], k: usize) -> Vec<Lab> {
    let mut centroids = vec![weighted_mean(points, weights)];
    while centroids.len() < k {
        let mut best_i = 0;
        let mut best = 0.0;
        for (i, &p) in points.iter().enumerate() {
            let d2 = centroids
                .iter()
                .map(|&c| lab_dist2(p, c))
                .fold(f64::INFINITY, f64::min);
            let score = weights[i] * d2;
            if score > best {
                best = score;
                best_i = i;
            }
        }
        if best <= 0.0 {
            break; // every point coincides with a seed — no distinct colour left
        }
        centroids.push(points[best_i]);
    }
    centroids
}

/// Agglomeratively merge `(centroid, weight)` clusters down to at most `k` by
/// repeatedly fusing the closest pair (hue-aware `merge_dist2`). The fused
/// centroid is the weight-weighted mean (i.e. still the salience-weighted mean of
/// the underlying pixels), weights add. Closest-first ordering means redundant
/// shades collapse before distinct hues do. O(m³) but m = k·OVERSEG ≤ 32.
fn merge_clusters(mut clusters: Vec<(Lab, f64)>, k: usize) -> Vec<(Lab, f64)> {
    while clusters.len() > k {
        let (mut bi, mut bj, mut bd) = (0, 1, f64::INFINITY);
        for i in 0..clusters.len() {
            for j in (i + 1)..clusters.len() {
                let d = merge_dist2(clusters[i].0, clusters[j].0);
                if d < bd {
                    bd = d;
                    bi = i;
                    bj = j;
                }
            }
        }
        let (cj, wj) = clusters.remove(bj);
        let (ci, wi) = clusters[bi];
        let w = wi + wj;
        clusters[bi] = (
            [
                (ci[0] * wi + cj[0] * wj) / w,
                (ci[1] * wi + cj[1] * wj) / w,
                (ci[2] * wi + cj[2] * wj) / w,
            ],
            w,
        );
    }
    clusters
}

/// Cluster `img`'s pixels into at most `k` perceptual swatches (k-means in
/// CIELAB), returned sorted by weight desc with empty clusters dropped. Pixels
/// are salience-weighted (see `salience`): a vivid pixel pulls more on both the
/// seeding and the centroid than a neutral one, so small saturated accents earn
/// swatches and stay vivid. `weight` is each cluster's share of the total
/// salience weight (0..1); the swatch colour is its weighted Lab centroid back
/// in sRGB. `k` is clamped to 1 (an empty image yields no swatches).
/// Deterministic: seeding is greedy farthest-first (no RNG).
fn palette(img: &image::RgbImage, k: usize) -> Vec<Swatch> {
    let points: Vec<Lab> = img.pixels().map(|p| rgb_to_lab(p.0)).collect();
    let n = points.len();
    let k = k.max(1);
    if n == 0 {
        return Vec::new();
    }
    let weights: Vec<f64> = points.iter().map(|&p| salience(p)).collect();

    // Over-segment, then merge back to k (below) so redundant shades collapse
    // before distinct hues. k-means alone can't merge two seeds.
    let fine_k = (k * PALETTE_OVERSEG).min(n);
    let mut centroids = seed_centroids(&points, &weights, fine_k);
    let mut assign = vec![0usize; n];

    for _ in 0..KMEANS_MAX_ITERS {
        // Assign each point to its nearest centroid (membership is by distance;
        // the weight changes a cluster's *influence*, not which one a pixel joins).
        let mut moved = false;
        for (i, &p) in points.iter().enumerate() {
            let mut best = 0;
            let mut best_d = f64::INFINITY;
            for (c, &cen) in centroids.iter().enumerate() {
                let d = lab_dist2(p, cen);
                if d < best_d {
                    best_d = d;
                    best = c;
                }
            }
            if assign[i] != best {
                assign[i] = best;
                moved = true;
            }
        }
        // Recompute centroids as the salience-weighted mean Lab of their members,
        // so a cluster's colour leans toward its most vivid pixels rather than
        // muddying to a plain average. Empty clusters stay put (dropped later).
        let mut sums = vec![[0.0f64; 3]; centroids.len()];
        let mut wsum = vec![0.0f64; centroids.len()];
        for (i, &p) in points.iter().enumerate() {
            let (c, w) = (assign[i], weights[i]);
            sums[c][0] += w * p[0];
            sums[c][1] += w * p[1];
            sums[c][2] += w * p[2];
            wsum[c] += w;
        }
        for (c, cen) in centroids.iter_mut().enumerate() {
            if wsum[c] > 0.0 {
                *cen = [sums[c][0] / wsum[c], sums[c][1] / wsum[c], sums[c][2] / wsum[c]];
            }
        }
        if !moved {
            break;
        }
    }

    // Final salience-weighted totals per fine cluster, dropping empties, then
    // merge the closest pairs down to k distinct colours.
    let mut wsum = vec![0.0f64; centroids.len()];
    for (i, &c) in assign.iter().enumerate() {
        wsum[c] += weights[i];
    }
    let fine: Vec<(Lab, f64)> = centroids
        .iter()
        .zip(&wsum)
        .filter(|(_, &w)| w > 0.0)
        .map(|(&cen, &w)| (cen, w))
        .collect();
    let merged = merge_clusters(fine, k);

    let total: f64 = merged.iter().map(|&(_, w)| w).sum();
    let mut swatches: Vec<Swatch> = merged
        .into_iter()
        .map(|(cen, w)| {
            let [r, g, b] = lab_to_rgb(cen);
            Swatch {
                hex: format!("#{r:02x}{g:02x}{b:02x}"),
                r,
                g,
                b,
                weight: w / total,
            }
        })
        .collect();
    swatches.sort_by(|a, b| b.weight.partial_cmp(&a.weight).unwrap());
    swatches
}

/// Decode `img_path`, downsample to `PALETTE_SAMPLE`, and extract a `k`-swatch
/// colour scheme (k-means in CIELAB). `k` is clamped to 3..=8 (the UI's range).
/// Runs on the blocking pool like `compute_histogram`, and rejects on the same
/// decode failures (HEIC/AVIF & broken files → Inspector "unavailable" state).
#[tauri::command]
pub async fn extract_palette(img_path: String, k: usize) -> Result<Vec<Swatch>, String> {
    let k = k.clamp(3, 8);
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&img_path).map_err(|e| format!("decode {img_path}: {e}"))?;
        // Downsample first: a colour summary needs only a representative sample,
        // and clustering thousands of pixels beats clustering millions.
        let small = img.thumbnail(PALETTE_SAMPLE, PALETTE_SAMPLE).to_rgb8();
        Ok(palette(&small, k))
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

    #[test]
    fn lab_round_trips_within_one_byte() {
        // sRGB → Lab → sRGB recovers the original bytes (±1 from rounding).
        for c in [[0, 0, 0], [255, 255, 255], [120, 80, 40], [10, 200, 90]] {
            let back = lab_to_rgb(rgb_to_lab(c));
            for ch in 0..3 {
                assert!((back[ch] as i32 - c[ch] as i32).abs() <= 1, "{c:?} -> {back:?}");
            }
        }
    }

    #[test]
    fn solid_image_collapses_to_one_swatch_full_weight() {
        let img = RgbImage::from_pixel(20, 20, Rgb([120, 80, 40]));
        let p = palette(&img, 5);
        // k-means over one colour ⇒ every other cluster is empty and dropped.
        assert_eq!(p.len(), 1);
        assert!((p[0].weight - 1.0).abs() < 1e-9);
        assert_eq!((p[0].r, p[0].g, p[0].b), (120, 80, 40));
        assert_eq!(p[0].hex, "#785028");
    }

    #[test]
    fn two_halves_split_into_two_weighted_swatches() {
        // Left half red, right half blue ⇒ two clusters, ~half weight each,
        // sorted by weight desc (ties resolved by k-means but both ≈0.5).
        let mut img = RgbImage::from_pixel(10, 10, Rgb([255, 0, 0]));
        for y in 0..10 {
            for x in 5..10 {
                img.put_pixel(x, y, Rgb([0, 0, 255]));
            }
        }
        let p = palette(&img, 5);
        assert_eq!(p.len(), 2, "two distinct colours ⇒ two non-empty clusters");
        assert!((p[0].weight - 0.5).abs() < 1e-9);
        assert!((p[1].weight - 0.5).abs() < 1e-9);
        let total: f64 = p.iter().map(|s| s.weight).sum();
        assert!((total - 1.0).abs() < 1e-9, "weights sum to 1");
    }

    #[test]
    fn a_small_vivid_accent_outweighs_its_pixel_area() {
        // 90% neutral grey, 10% vivid red — the case the screenshots flagged.
        // Pure area weighting would give red 0.10; salience (chroma boost) lifts
        // it well above its area so it reads as a real swatch, and it stays red.
        let mut img = RgbImage::from_pixel(10, 10, Rgb([128, 128, 128]));
        for x in 0..10 {
            img.put_pixel(x, 0, Rgb([220, 20, 30]));
        }
        let p = palette(&img, 5);
        assert_eq!(p.len(), 2, "grey + red, other clusters empty");

        let red = p
            .iter()
            .find(|s| s.r > 180 && s.g < 80 && s.b < 90)
            .expect("a vivid red swatch is present");
        assert!(red.weight > 0.25, "red lifted above its 0.10 area: {}", red.weight);
        // Grey is still the larger share (we lift the accent, not bury the base).
        let grey = p.iter().find(|s| (s.r as i32 - s.g as i32).abs() < 12).unwrap();
        assert!(grey.weight > red.weight, "neutral base still dominates");
    }

    #[test]
    fn a_hue_isolated_accent_survives_among_many_regions() {
        // A warm/neutral scene (white, grey, terracotta, black) with one tiny
        // blue patch — the palette3/palette4 case. Greedy farthest-first seeding
        // grabs the blue (the only cool hue) even though it's ~1% of the image
        // and competes with several larger regions for the k slots. Probabilistic
        // k-means++ could skip it on an unlucky draw; this is the regression guard.
        let mut img = RgbImage::new(20, 20);
        for y in 0..20 {
            let band = match y {
                0..=4 => [240, 240, 240],
                5..=9 => [128, 128, 128],
                10..=14 => [200, 100, 60],
                _ => [20, 20, 20],
            };
            for x in 0..20 {
                img.put_pixel(x, y, Rgb(band));
            }
        }
        // 2×2 blue accent (~1% of the image).
        for y in 0..2 {
            for x in 0..2 {
                img.put_pixel(x, y, Rgb([30, 40, 160]));
            }
        }
        let p = palette(&img, 5);
        let blue = p
            .iter()
            .find(|s| s.b > 120 && s.b as i32 > s.r as i32 + 40 && s.b as i32 > s.g as i32 + 40);
        assert!(blue.is_some(), "isolated blue accent present: {p:?}");
    }

    #[test]
    fn two_shades_of_one_hue_collapse_freeing_a_slot_for_a_distinct_hue() {
        // The pallette3 case: a region in two shades of red (same hue, different
        // lightness) should be ONE swatch, not two, so a small distinct hue (blue)
        // still fits within k. Chroma-primary distance (L_WEIGHT < 1) folds the
        // shades together; full-weight L would seed both reds before reaching blue.
        let mut img = RgbImage::new(30, 30);
        let paint = |img: &mut RgbImage, rows: std::ops::Range<u32>, c: [u8; 3]| {
            for y in rows {
                for x in 0..30 {
                    img.put_pixel(x, y, Rgb(c));
                }
            }
        };
        paint(&mut img, 0..5, [210, 45, 40]); // bright red \ same hue,
        paint(&mut img, 5..10, [120, 28, 25]); // dark red    / two shades
        paint(&mut img, 10..18, [235, 228, 210]); // cream
        paint(&mut img, 18..25, [40, 38, 38]); // faded black
        paint(&mut img, 25..30, [150, 110, 75]); // light brown
        for y in 0..3 {
            for x in 0..3 {
                img.put_pixel(x, y, Rgb([40, 55, 150])); // tiny blue accent
            }
        }

        let p = palette(&img, 5);
        let reds = p
            .iter()
            .filter(|s| s.r as i32 > s.g as i32 + 40 && s.r as i32 > s.b as i32 + 40)
            .count();
        assert_eq!(reds, 1, "the two red shades are one swatch, not two: {p:?}");
        let blue = p
            .iter()
            .find(|s| s.b > 120 && s.b as i32 > s.r as i32 + 30 && s.b as i32 > s.g as i32 + 30);
        assert!(blue.is_some(), "blue still fits at k=5: {p:?}");
    }
}
