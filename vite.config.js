import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  // GitHub Pages serves from /<repository>/ (set by the deploy workflow).
  base: process.env.BASE_PATH || "/",
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
