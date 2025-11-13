import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../src/shared")
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true
      }
    }
  }
});
