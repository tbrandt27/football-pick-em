// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        "/api": {
          target:
            process.env.NODE_ENV === "production"
              ? `http://localhost:${process.env.BACKEND_PORT || 3001}`
              : "http://localhost:3001",
          changeOrigin: true,
        },
        "/logos": {
          target:
            process.env.NODE_ENV === "production"
              ? `http://localhost:${process.env.BACKEND_PORT || 3001}`
              : "http://localhost:3001",
          changeOrigin: true,
        },
      },
    },
  },
});
