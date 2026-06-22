import { writable } from "svelte/store";

/** The Eyedropper's current reading: the pixel under the cursor as R/G/B/L
 *  (ADR-0003 defines L), or `null` when the cursor isn't over image pixels.
 *
 *  Transient, in-memory only — unlike `backdrop` / `inspectorOpen` this is never
 *  persisted. The Viewer writes it on hover (only while the Inspector is open);
 *  the Inspector's Colour region reads it, and Slice 8's histogram hover-line
 *  will read the same source. Resets to `null` on image change, mouse-leave, and
 *  Inspector close. */
export type Reading = { r: number; g: number; b: number; l: number };

export const reading = writable<Reading | null>(null);
