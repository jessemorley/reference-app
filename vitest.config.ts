import { defineConfig, mergeConfig } from "vitest/config";
import { svelteTesting } from "@testing-library/svelte/vite";
import viteConfig from "./vite.config";

// Layers the test runner on top of the Tauri-focused vite.config.
// svelteTesting() wires up the browser resolve conditions and auto-cleanup
// that @testing-library/svelte needs; it's test-only, so it lives here.
export default mergeConfig(
  viteConfig,
  defineConfig({
    plugins: [svelteTesting()],
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./vitest-setup.ts"],
      // The Rust side has its own `cargo test`; keep Vitest to the frontend.
      include: ["src/**/*.{test,spec}.{ts,js}"],
    },
  })
);
