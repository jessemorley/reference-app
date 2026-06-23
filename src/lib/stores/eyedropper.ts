import { writable } from "svelte/store";

/** Transient, never persisted — resets to null on image change, leave, and Inspector close. */
export type Reading = { r: number; g: number; b: number; l: number };

export const reading = writable<Reading | null>(null);
