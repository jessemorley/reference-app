import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import type { Photographer } from "../types";
import {
  selected,
  openIndex,
  canBack,
  canForward,
  openPhotographer,
  goRoot,
  openImage,
  closeViewer,
  pageImage,
  back,
  forward,
  resetToRoot,
} from "./navigation";

const ansel: Photographer = {
  name: "Ansel",
  relPath: "Ansel",
  coverPath: "/r/Ansel/a.jpg",
  pinned: false,
};
const vivian: Photographer = {
  name: "Vivian",
  relPath: "Vivian",
  coverPath: "/r/Vivian/v.jpg",
  pinned: false,
};

beforeEach(() => resetToRoot());

describe("navigation history", () => {
  it("starts at the root grid with no history either way", () => {
    expect(get(selected)).toBeNull();
    expect(get(openIndex)).toBeNull();
    expect(get(canBack)).toBe(false);
    expect(get(canForward)).toBe(false);
  });

  it("walks root → photographer → image and back/forward through the levels", () => {
    openPhotographer(ansel);
    openImage(3);

    expect(get(selected)).toBe(ansel);
    expect(get(openIndex)).toBe(3);
    expect(get(canForward)).toBe(false);

    // Back closes the viewer (same photographer, no open image)…
    back();
    expect(get(selected)).toBe(ansel);
    expect(get(openIndex)).toBeNull();
    // …back again returns to the root grid.
    back();
    expect(get(selected)).toBeNull();
    expect(get(canBack)).toBe(false);

    // Forward retraces the exact path.
    forward();
    expect(get(selected)).toBe(ansel);
    forward();
    expect(get(openIndex)).toBe(3);
    expect(get(canForward)).toBe(false);
  });

  it("paging within the viewer replaces the entry instead of stacking history", () => {
    openPhotographer(ansel);
    openImage(0);
    pageImage(1);
    pageImage(2);

    expect(get(openIndex)).toBe(2);
    // One back skips straight past the paging to the photographer grid.
    back();
    expect(get(openIndex)).toBeNull();
    expect(get(selected)).toBe(ansel);
  });

  it("a new navigation truncates the forward tail", () => {
    openPhotographer(ansel);
    back(); // at root, ansel is now forward history
    expect(get(canForward)).toBe(true);

    openPhotographer(vivian); // branches off — ansel forward is dropped
    expect(get(selected)).toBe(vivian);
    expect(get(canForward)).toBe(false);
  });

  it("closeViewer returns to the photographer grid", () => {
    openPhotographer(ansel);
    openImage(5);
    closeViewer();

    expect(get(selected)).toBe(ansel);
    expect(get(openIndex)).toBeNull();
  });

  it("goRoot pushes a root entry reachable by back", () => {
    openPhotographer(ansel);
    goRoot();

    expect(get(selected)).toBeNull();
    back();
    expect(get(selected)).toBe(ansel);
  });
});
