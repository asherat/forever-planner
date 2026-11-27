import { resolve } from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  root: "web",
  base: "./",
  plugins: [vue()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        gear: resolve(import.meta.dirname, "web/index.html"),
        crafting: resolve(import.meta.dirname, "web/crafting.html"),
        professions: resolve(import.meta.dirname, "web/professions.html")
      }
    }
  }
});
