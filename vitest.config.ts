import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Two projects: the Express/Node layer runs on the node pool, the React
    // islands need a DOM. Keeping them separate avoids loading jsdom for
    // backend specs and keeps `server/` from seeing browser globals.
    projects: [
      {
        test: {
          name: "server",
          environment: "node",
          include: ["test/server/**/*.test.{js,ts}"],
        },
      },
      {
        test: {
          name: "client",
          environment: "jsdom",
          setupFiles: ["./test/setup.client.ts"],
          include: ["test/client/**/*.test.{ts,tsx}"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["server/**/*.js", "src/**/*.{ts,tsx}"],
      exclude: [
        "server/providers/**",
        "server/services/database/**",
        "src/**/*.d.ts",
      ],
    },
  },
});
