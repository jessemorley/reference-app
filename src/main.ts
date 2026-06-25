import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";

// Suppress the WKWebView's native right-click menu app-wide so right-clicking
// chrome never exposes browser context menus. The app's own custom menus (the
// Viewer backdrop menu, the photographer-tile menu) open from their own element
// handlers and are unaffected — they preventDefault and then show their menu.
document.addEventListener("contextmenu", (e) => e.preventDefault());

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
