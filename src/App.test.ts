import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import App from "./App.svelte";
import { root } from "./lib/stores/root";
import { selected, openIndex } from "./lib/stores/navigation";

// App hydrates from getRoot() on mount and opens the picker via selectRoot().
// Mock the IPC layer so the component's branching is the only thing under test.
vi.mock("./lib/ipc", () => ({
  getRoot: vi.fn(),
  selectRoot: vi.fn(),
  // App also hydrates tile sizes on mount; the header sliders persist via
  // setTileSize. Stub both so App's branching stays the only thing under test.
  getTileSizes: vi.fn(),
  setTileSize: vi.fn(),
  // App also hydrates the persisted Backdrop, Inspector and palette-k
  // preferences on mount; stub them too.
  getBackdrop: vi.fn(),
  getInspectorOpen: vi.fn(),
  getPaletteK: vi.fn(),
  // The loaded shell mounts PhotographerGrid, which scans on mount; stub it so
  // App's branching stays the only thing under test.
  listPhotographers: vi.fn(),
}));
import {
  getRoot,
  selectRoot,
  getTileSizes,
  getBackdrop,
  getInspectorOpen,
  getPaletteK,
  listPhotographers,
} from "./lib/ipc";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPhotographers).mockResolvedValue([]);
  vi.mocked(getTileSizes).mockResolvedValue({ root: null, photographer: null });
  vi.mocked(getBackdrop).mockResolvedValue(null);
  vi.mocked(getInspectorOpen).mockResolvedValue(null);
  vi.mocked(getPaletteK).mockResolvedValue(null);
  // The root store is a module-level singleton; reset it between tests.
  root.set(null);
  // The navigation stores are likewise module-level; start each test on the grid.
  selected.set(null);
  openIndex.set(null);
});

describe("App branching", () => {
  it("shows Loading while the initial getRoot() is in flight", () => {
    // A promise that never resolves keeps us in the pre-ready state.
    vi.mocked(getRoot).mockReturnValue(new Promise(() => {}));

    render(App);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows the RootPicker on first run (no persisted root)", async () => {
    vi.mocked(getRoot).mockResolvedValue(null);

    render(App);

    // RootPicker's heading; awaited so onMount has resolved and ready is true.
    expect(
      await screen.findByRole("heading", { name: "Reference" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("shows the loaded shell with the persisted root path", async () => {
    vi.mocked(getRoot).mockResolvedValue("/Users/me/Photography");

    render(App);

    // The root path is now the search bar's hover title (it replaced the path
    // label), so assert on the searchbox rather than visible text.
    const search = await screen.findByRole("searchbox");
    expect(search).toHaveAttribute("title", "/Users/me/Photography");
    expect(
      screen.getByRole("button", { name: "Change folder…" })
    ).toBeInTheDocument();
  });

  it("updates the shell when Change folder… picks a new root", async () => {
    vi.mocked(getRoot).mockResolvedValue("/Users/me/Photography");
    vi.mocked(selectRoot).mockResolvedValue("/Users/me/NewRoot");

    render(App);

    const button = await screen.findByRole("button", {
      name: "Change folder…",
    });
    button.click();

    const search = await screen.findByRole("searchbox");
    await vi.waitFor(() =>
      expect(search).toHaveAttribute("title", "/Users/me/NewRoot")
    );
  });
});
