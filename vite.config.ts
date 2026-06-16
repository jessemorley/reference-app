import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// @tauri-apps/cli sets this when running on a device/remote dev host.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],

  // Tauri expects a fixed port and surfaces Rust errors itself, so don't let
  // Vite clear the screen or wander to another port.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // The Rust side is rebuilt by Tauri, not watched by Vite.
      ignored: ["**/src-tauri/**"],
    },
  },
});
