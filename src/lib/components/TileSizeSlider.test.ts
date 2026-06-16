import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { get } from "svelte/store";
import TileSizeSlider from "./TileSizeSlider.svelte";
import { settings, DEFAULT_TILE_SIZE } from "../stores/settings";

// The slider persists via setTileSize; mock the IPC layer so we can assert the
// live store update (input) and the persist-on-release (change) separately.
vi.mock("../ipc", () => ({ setTileSize: vi.fn() }));
import { setTileSize } from "../ipc";

beforeEach(() => {
  vi.clearAllMocks();
  // settings is a module-level singleton; reset to defaults between tests.
  settings.set({ ...DEFAULT_TILE_SIZE });
});

describe("TileSizeSlider", () => {
  it("reflects its view's current size and bounds", () => {
    render(TileSizeSlider, { view: "root" });

    const input = screen.getByRole("slider") as HTMLInputElement;
    expect(input.value).toBe(String(DEFAULT_TILE_SIZE.root));
    expect(input.min).toBe("120");
    expect(input.max).toBe("320");
  });

  it("updates the store live on input without persisting", async () => {
    render(TileSizeSlider, { view: "root" });
    const input = screen.getByRole("slider");

    await fireEvent.input(input, { target: { value: "240" } });

    expect(get(settings).root).toBe(240);
    // Other views are untouched, and a drag tick must not hit the disk.
    expect(get(settings).photographer).toBe(DEFAULT_TILE_SIZE.photographer);
    expect(setTileSize).not.toHaveBeenCalled();
  });

  it("persists the view's size on change (release)", async () => {
    render(TileSizeSlider, { view: "photographer" });
    const input = screen.getByRole("slider");

    await fireEvent.change(input, { target: { value: "200" } });

    expect(setTileSize).toHaveBeenCalledTimes(1);
    expect(setTileSize).toHaveBeenCalledWith("photographer", 200);
  });
});
