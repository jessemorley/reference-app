import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import App from "./App.svelte";
import { root } from "./lib/stores/root";
import { selected } from "./lib/stores/navigation";

// App hydrates from getRoot() on mount and opens the picker via selectRoot().
// Mock the IPC layer so the component's branching is the only thing under test.
vi.mock("./lib/ipc", () => ({
  getRoot: vi.fn(),
  selectRoot: vi.fn(),
  // App also hydrates tile sizes on mount; the header sliders persist via
  // setTileSize. Stub both so App's branching stays the only thing under test.
  getTileSizes: vi.fn(),
  setTileSize: vi.fn(),
  // App also hydrates the persisted Backdrop on mount; stub it too.
  getBackdrop: vi.fn(),
  // The loaded shell mounts PhotographerGrid, which scans on mount; stub it so
  // App's branching stays the only thing under test.
  listPhotographers: vi.fn(),
}));
import {
  getRoot,
  selectRoot,
  getTileSizes,
  getBackdrop,
  listPhotographers,
} from "./lib/ipc";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPhotographers).mockResolvedValue([]);
  vi.mocked(getTileSizes).mockResolvedValue({ root: null, photographer: null });
  vi.mocked(getBackdrop).mockResolvedValue(null);
  // The root store is a module-level singleton; reset it between tests.
  root.set(null);
  // navigation.selected is likewise module-level; start each test on the grid.
  selected.set(null);
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

    expect(
      await screen.findByText("/Users/me/Photography")
    ).toBeInTheDocument();
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

    expect(await screen.findByText("/Users/me/NewRoot")).toBeInTheDocument();
  });
});
