import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import PhotographerView from "./PhotographerView.svelte";
import { activeTab, ALL_TAB } from "../stores/navigation";
import type { Photographer, RefImage } from "../types";

// The view loads via listImages on mount; each cell's Thumb resolves via
// ensureThumb. Mock the IPC layer so tab synthesis and filtering are what's
// under test. Resolved thumbs render an <img alt={image name}>, so images are
// addressable by their file name.
vi.mock("../ipc", () => ({
  listImages: vi.fn(),
  ensureThumb: vi.fn(),
  setCover: vi.fn(),
  revealInFinder: vi.fn(),
}));
import { listImages, ensureThumb, setCover } from "../ipc";

const ANSEL: Photographer = {
  name: "Ansel",
  relPath: "Ansel",
  coverPath: "/r/Ansel/loose.jpg",
  pinned: false, instagram: null, blurb: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureThumb).mockResolvedValue("asset://thumb");
  // activeTab is a module-level singleton; reset between tests.
  activeTab.set(ALL_TAB);
});

describe("PhotographerView", () => {
  it("shows the loading state while the scan is in flight", () => {
    vi.mocked(listImages).mockReturnValue(new Promise(() => {}));

    render(PhotographerView, { root: "/r", photographer: ANSEL });

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(listImages).toHaveBeenCalledWith("/r", "Ansel");
  });

  it("renders no tab bar when every image is loose", async () => {
    const images: RefImage[] = [
      { name: "a.jpg", path: "/r/Ansel/a.jpg", category: null },
      { name: "b.jpg", path: "/r/Ansel/b.jpg", category: null },
    ];
    vi.mocked(listImages).mockResolvedValue({ categories: [], images });

    render(PhotographerView, { root: "/r", photographer: ANSEL });

    expect(await screen.findByAltText("a.jpg")).toBeInTheDocument();
    expect(screen.getByAltText("b.jpg")).toBeInTheDocument();
    // No Categories ⇒ no tabs at all.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("builds All + Categories + Uncategorised when loose and Categories coexist", async () => {
    const images: RefImage[] = [
      { name: "loose.jpg", path: "/r/Ansel/loose.jpg", category: null },
      { name: "p1.jpg", path: "/r/Ansel/portraits/p1.jpg", category: "portraits" },
      { name: "s1.jpg", path: "/r/Ansel/street/s1.jpg", category: "street" },
    ];
    vi.mocked(listImages).mockResolvedValue({
      categories: [
        { name: "portraits", count: 1 },
        { name: "street", count: 1 },
      ],
      images,
    });

    render(PhotographerView, { root: "/r", photographer: ANSEL });

    const tabs = await screen.findByRole("navigation");
    const labels = Array.from(tabs.querySelectorAll("button")).map((b) =>
      b.textContent?.replace(/\s+/g, " ").trim()
    );
    expect(labels).toEqual(["All3", "portraits1", "street1", "Uncategorised1"]);
  });

  it("omits the Uncategorised tab when there are no loose images", async () => {
    const images: RefImage[] = [
      { name: "p1.jpg", path: "/r/Ansel/portraits/p1.jpg", category: "portraits" },
    ];
    vi.mocked(listImages).mockResolvedValue({
      categories: [{ name: "portraits", count: 1 }],
      images,
    });

    render(PhotographerView, { root: "/r", photographer: ANSEL });

    expect(await screen.findByRole("navigation")).toBeInTheDocument();
    expect(screen.queryByText("Uncategorised")).not.toBeInTheDocument();
  });

  it("filters the grid to the active tab", async () => {
    const images: RefImage[] = [
      { name: "loose.jpg", path: "/r/Ansel/loose.jpg", category: null },
      { name: "p1.jpg", path: "/r/Ansel/portraits/p1.jpg", category: "portraits" },
    ];
    vi.mocked(listImages).mockResolvedValue({
      categories: [{ name: "portraits", count: 1 }],
      images,
    });

    render(PhotographerView, { root: "/r", photographer: ANSEL });

    // "All" shows both.
    expect(await screen.findByAltText("loose.jpg")).toBeInTheDocument();
    expect(screen.getByAltText("p1.jpg")).toBeInTheDocument();

    // Click the portraits tab → only its image remains.
    screen.getByRole("button", { name: /portraits/ }).click();

    expect(await screen.findByAltText("p1.jpg")).toBeInTheDocument();
    expect(screen.queryByAltText("loose.jpg")).not.toBeInTheDocument();
  });

  it("shows an empty message when the photographer has no images", async () => {
    vi.mocked(listImages).mockResolvedValue({ categories: [], images: [] });

    render(PhotographerView, { root: "/r", photographer: ANSEL });

    expect(
      await screen.findByText("No images in this photographer's folder.")
    ).toBeInTheDocument();
  });

  it("right-click cover menu is state-aware and pins/resets the cover", async () => {
    const images: RefImage[] = [
      { name: "loose.jpg", path: "/r/Ansel/loose.jpg", category: null },
      { name: "p1.jpg", path: "/r/Ansel/p1.jpg", category: null },
    ];
    vi.mocked(listImages).mockResolvedValue({ categories: [], images });
    // Ansel's cover is pinned to p1.jpg.
    const pinned = { ...ANSEL, coverPath: "/r/Ansel/p1.jpg", pinned: true };

    render(PhotographerView, { root: "/r", photographer: pinned });
    const p1 = (await screen.findByAltText("p1.jpg")).closest("button")!;
    const loose = screen.getByAltText("loose.jpg").closest("button")!;

    // The pinned tile offers a reset.
    await fireEvent.contextMenu(p1);
    expect(screen.getByText("Reset to default cover")).toBeInTheDocument();

    // A different tile offers "Set as cover"; clicking it pins that image.
    await fireEvent.contextMenu(loose);
    const setItem = screen.getByText("Set as cover");
    setItem.click();
    expect(setCover).toHaveBeenCalledWith("Ansel", "/r/Ansel/loose.jpg");

    // loose.jpg is now the pinned cover, so its menu offers a reset.
    await fireEvent.contextMenu(loose);
    const resetItem = screen.getByText("Reset to default cover");
    resetItem.click();
    expect(setCover).toHaveBeenCalledWith("Ansel", null);
  });

  it("surfaces a read error", async () => {
    vi.mocked(listImages).mockRejectedValue(new Error("denied"));

    render(PhotographerView, { root: "/r", photographer: ANSEL });

    expect(
      await screen.findByText(/Couldn't read this photographer: denied/)
    ).toBeInTheDocument();
  });
});
