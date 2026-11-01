import { createRoot } from "react-dom/client";
import SmartTeleprompter from "./App";
import "./styles/index.css";

const root = createRoot(document.getElementById("root"));
root.render(<SmartTeleprompter />);

// Register the service worker (offline support / installable PWA).
// PROD-only so `vite dev` is never served stale files from the cache.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
