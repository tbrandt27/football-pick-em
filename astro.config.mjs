// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({
    mode: "middleware",
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        "/api": {
          target: `http://localhost:${process.env.BACKEND_PORT || process.env.PORT || 3001}`,
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('error', (err, req, res) => {
              console.log('Proxy error for /api:', err.message);
              if (err.message.includes('ECONNREFUSED')) {
                console.log('Backend server not available. Make sure it\'s running on port', options.target);
              }
            });
          }
        },
        "/logos": {
          target: `http://localhost:${process.env.BACKEND_PORT || process.env.PORT || 3001}`,
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('error', (err, req, res) => {
              console.log('Proxy error for /logos:', err.message);
              if (err.message.includes('ECONNREFUSED')) {
                console.log('Backend server not available. Make sure it\'s running on port', options.target);
              }
            });
          }
        },
      },
    },
  },
});
