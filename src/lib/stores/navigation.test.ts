import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import type { Photographer } from "../types";
import { selected, openIndex, canBack, back } from "./navigation";

const ansel: Photographer = {
  name: "Ansel",
  relPath: "Ansel",
  coverPath: "/r/Ansel/a.jpg",
  pinned: false, instagram: null, blurb: null,
};

beforeEach(() => {
  selected.set(null);
  openIndex.set(null);
});

describe("navigation (ascend one level)", () => {
  it("starts at the root grid with nothing to ascend to", () => {
    expect(get(selected)).toBeNull();
    expect(get(openIndex)).toBeNull();
    expect(get(canBack)).toBe(false);
  });

  it("ascends image → grid → root, one level per back", () => {
    selected.set(ansel);
    openIndex.set(3);
    expect(get(canBack)).toBe(true);

    // image → photographer grid
    back();
    expect(get(selected)).toBe(ansel);
    expect(get(openIndex)).toBeNull();
    expect(get(canBack)).toBe(true);

    // photographer → root
    back();
    expect(get(selected)).toBeNull();
    expect(get(canBack)).toBe(false);
  });

  it("canBack is true at the photographer level (no open image)", () => {
    selected.set(ansel);
    expect(get(canBack)).toBe(true);
  });

  it("a folder reset clears both levels", () => {
    selected.set(ansel);
    openIndex.set(2);
    selected.set(null);
    openIndex.set(null);
    expect(get(canBack)).toBe(false);
  });
});
