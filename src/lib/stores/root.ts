import { writable } from "svelte/store";

/** The currently selected Photography Root, or null before one is chosen.
 *  Hydrated from the backend on startup (see App.svelte). */
export const root = writable<string | null>(null);
