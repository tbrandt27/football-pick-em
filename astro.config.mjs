// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

const backendPort = process.env.BACKEND_PORT || process.env.PORT || 3001;
const backendTarget = `http://localhost:${backendPort}`;

/**
 * Logs proxy failures once with actionable text instead of a raw ECONNREFUSED
 * stack. Shared by the /api and /logos dev proxies.
 * @param {string} label
 * @returns {(proxy: import("node:events").EventEmitter) => void}
 */
const onProxyError = (label) => (proxy) => {
  proxy.on("error", (/** @type {Error} */ err) => {
    console.log(`Proxy error for ${label}: ${err.message}`);
    if (err.message.includes("ECONNREFUSED")) {
      console.log(`Backend server not available at ${backendTarget}. Is 'npm run dev:backend' running?`);
    }
  });
};

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
          target: backendTarget,
          changeOrigin: true,
          configure: onProxyError("/api"),
        },
        "/logos": {
          target: backendTarget,
          changeOrigin: true,
          configure: onProxyError("/logos"),
        },
      },
    },
  },
});
