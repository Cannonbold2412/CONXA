import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  base: "./",
  plugins: [react(), tailwindcss()],
  server: { port: 5175, strictPort: true },
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
  },
  resolve: {
    alias: { "@": path.join(root, "src") },
  },
});
