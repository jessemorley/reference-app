import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import PhotographerGrid from "./PhotographerGrid.svelte";
import type { Photographer } from "../types";

// The grid scans via listPhotographers on mount; mock the IPC layer so the
// component's state branching (scanning → loaded/empty/error) is under test.
vi.mock("../ipc", () => ({ listPhotographers: vi.fn() }));
import { listPhotographers } from "../ipc";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PhotographerGrid", () => {
  it("shows the scanning state while the scan is in flight", () => {
    vi.mocked(listPhotographers).mockReturnValue(new Promise(() => {}));

    render(PhotographerGrid, { root: "/root" });

    expect(screen.getByText("Scanning…")).toBeInTheDocument();
  });

  it("renders a tile per photographer once loaded", async () => {
    const photographers: Photographer[] = [
      { name: "Abe", relPath: "Abe", coverThumb: "asset://abe" },
      { name: "Zed", relPath: "Zed", coverThumb: null },
    ];
    vi.mocked(listPhotographers).mockResolvedValue(photographers);

    render(PhotographerGrid, { root: "/root" });

    expect(await screen.findByText("Abe")).toBeInTheDocument();
    expect(screen.getByText("Zed")).toBeInTheDocument();
    // The cover image carries the asset URL.
    const cover = screen.getByRole("presentation") as HTMLImageElement;
    expect(cover.src).toContain("asset://abe");
  });

  it("shows an empty message when no photographers have images", async () => {
    vi.mocked(listPhotographers).mockResolvedValue([]);

    render(PhotographerGrid, { root: "/root" });

    expect(
      await screen.findByText("No photographers with images in this folder.")
    ).toBeInTheDocument();
  });

  it("surfaces a read error", async () => {
    vi.mocked(listPhotographers).mockRejectedValue(new Error("denied"));

    render(PhotographerGrid, { root: "/root" });

    expect(
      await screen.findByText(/Couldn't read this folder: denied/)
    ).toBeInTheDocument();
  });
});
