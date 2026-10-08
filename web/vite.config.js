import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// /api is forwarded to the Node backend during development.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { cssMinify: "esbuild" }, // geoman CSS has data URIs the default minifier rejects
  server: { proxy: { "/api": "http://localhost:4000" } },
});
