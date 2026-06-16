import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Thumb from "./Thumb.svelte";

// Thumb resolves its image via ensureThumb; mock the IPC layer so the
// placeholder → image swap is under test without a Tauri backend.
vi.mock("../ipc", () => ({ ensureThumb: vi.fn() }));
import { ensureThumb } from "../ipc";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Thumb", () => {
  it("shows a placeholder while the thumbnail is resolving", () => {
    vi.mocked(ensureThumb).mockReturnValue(new Promise(() => {}));

    const { container } = render(Thumb, { path: "/photos/a.jpg" });

    expect(container.querySelector(".placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(ensureThumb).toHaveBeenCalledWith("/photos/a.jpg");
  });

  it("swaps in the image once the thumbnail resolves", async () => {
    vi.mocked(ensureThumb).mockResolvedValue("asset://thumb/a");

    render(Thumb, { path: "/photos/a.jpg", alt: "Cover" });

    const img = (await screen.findByRole("img")) as HTMLImageElement;
    expect(img.src).toContain("asset://thumb/a");
    expect(img.alt).toBe("Cover");
  });

  it("keeps the placeholder when no path is given", () => {
    const { container } = render(Thumb, { path: null });

    expect(container.querySelector(".placeholder")).toBeInTheDocument();
    expect(ensureThumb).not.toHaveBeenCalled();
  });

  it("keeps the placeholder when thumbnail generation fails", async () => {
    vi.mocked(ensureThumb).mockRejectedValue(new Error("decode failed"));

    const { container } = render(Thumb, { path: "/photos/broken.heic" });

    // Let the rejected promise settle, then confirm no image appeared.
    await vi.waitFor(() => expect(ensureThumb).toHaveBeenCalled());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector(".placeholder")).toBeInTheDocument();
  });
});
