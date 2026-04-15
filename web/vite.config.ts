import path from "node:path";
import process from "node:process";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const indexerPort = process.env.INDEXER_API_PORT || "3456";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  define: {
    "import.meta.env.VITE_INDEXER_API_PORT": JSON.stringify(indexerPort),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
