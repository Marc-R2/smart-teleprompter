import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The speech runtime loads its WebAssembly from a CDN. The copy Vite would emit
// is never used, and at 27 MB exceeds Cloudflare Pages' 25 MiB file limit.
const dropUnusedWasm = {
  name: "drop-unused-wasm",
  generateBundle(_options, bundle) {
    for (const file of Object.keys(bundle)) {
      if (file.endsWith(".wasm")) delete bundle[file];
    }
  },
};

export default defineConfig({
  plugins: [tailwindcss(), react()],
  // GitHub Pages serves from /<repository>/ (set by the deploy workflow).
  base: process.env.BASE_PATH || "/",
  worker: {
    format: "es",
    plugins: () => [dropUnusedWasm],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
      },
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
