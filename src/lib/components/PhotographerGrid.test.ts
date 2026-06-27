import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import PhotographerGrid from "./PhotographerGrid.svelte";
import type { Photographer } from "../types";

// The grid scans via listPhotographers on mount, and each tile's Thumb resolves
// its cover via ensureThumb. Mock the whole IPC layer so the component's state
// branching (scanning → loaded/empty/error) and cover wiring are under test.
vi.mock("../ipc", () => ({
  listPhotographers: vi.fn(),
  ensureThumb: vi.fn(),
}));
import { listPhotographers, ensureThumb } from "../ipc";
import { search } from "../stores/navigation";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureThumb).mockResolvedValue("asset://thumb");
  search.set(""); // module-level singleton; reset between tests
});

describe("PhotographerGrid", () => {
  it("shows the scanning state while the scan is in flight", () => {
    vi.mocked(listPhotographers).mockReturnValue(new Promise(() => {}));

    render(PhotographerGrid, { root: "/root", onselect: vi.fn() });

    expect(screen.getByText("Scanning…")).toBeInTheDocument();
  });

  it("renders a tile per photographer and thumbnails each cover", async () => {
    const photographers: Photographer[] = [
      { name: "Abe", relPath: "Abe", coverPath: "/root/Abe/a.jpg", pinned: false, instagram: null, blurb: null },
      { name: "Zed", relPath: "Zed", coverPath: null, pinned: false, instagram: null, blurb: null },
    ];
    vi.mocked(listPhotographers).mockResolvedValue(photographers);

    render(PhotographerGrid, { root: "/root", onselect: vi.fn() });

    expect(await screen.findByText("Abe")).toBeInTheDocument();
    expect(screen.getByText("Zed")).toBeInTheDocument();
    // Abe's cover is thumbnailed by path; Zed has no cover so isn't requested.
    expect(ensureThumb).toHaveBeenCalledTimes(1);
    expect(ensureThumb).toHaveBeenCalledWith("/root/Abe/a.jpg");

    // Covers are decorative (alt=""), so the resolved img has role presentation;
    // the visible name overlay is the tile button's accessible label.
    const cover = (await screen.findByRole("presentation")) as HTMLImageElement;
    expect(cover.src).toContain("asset://thumb");
  });

  it("calls onselect with the photographer when its tile is clicked", async () => {
    const photographers: Photographer[] = [
      { name: "Abe", relPath: "Abe", coverPath: "/root/Abe/a.jpg", pinned: false, instagram: null, blurb: null },
    ];
    vi.mocked(listPhotographers).mockResolvedValue(photographers);
    const onselect = vi.fn();

    render(PhotographerGrid, { root: "/root", onselect });

    // The tile is a button labelled by its title (the photographer name).
    const tile = await screen.findByRole("button", { name: "Abe" });
    tile.click();

    expect(onselect).toHaveBeenCalledTimes(1);
    expect(onselect).toHaveBeenCalledWith(photographers[0]);
  });

  it("filters tiles by the search query and shows a no-match state", async () => {
    const photographers: Photographer[] = [
      { name: "Ansel", relPath: "Ansel", coverPath: "/root/Ansel/a.jpg", pinned: false, instagram: null, blurb: null },
      { name: "Vivian", relPath: "Vivian", coverPath: "/root/Vivian/v.jpg", pinned: false, instagram: null, blurb: null },
    ];
    vi.mocked(listPhotographers).mockResolvedValue(photographers);

    render(PhotographerGrid, { root: "/root", onselect: vi.fn() });
    await screen.findByText("Ansel");

    // Case-insensitive substring → only Vivian matches "viv".
    search.set("viv");
    expect(await screen.findByText("Vivian")).toBeInTheDocument();
    expect(screen.queryByText("Ansel")).not.toBeInTheDocument();

    // No match → empty state quoting the query.
    search.set("zzz");
    expect(await screen.findByText(/No photographers match/)).toBeInTheDocument();
  });

  it("shows an empty message when no photographers have images", async () => {
    vi.mocked(listPhotographers).mockResolvedValue([]);

    render(PhotographerGrid, { root: "/root", onselect: vi.fn() });

    expect(
      await screen.findByText("No photographers with images in this folder.")
    ).toBeInTheDocument();
  });

  it("surfaces a read error", async () => {
    vi.mocked(listPhotographers).mockRejectedValue(new Error("denied"));

    render(PhotographerGrid, { root: "/root", onselect: vi.fn() });

    expect(
      await screen.findByText(/Couldn't read this folder: denied/)
    ).toBeInTheDocument();
  });
});
