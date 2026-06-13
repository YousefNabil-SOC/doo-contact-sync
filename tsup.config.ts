import { defineConfig } from "tsup";

/**
 * Bundles the standalone MCP server (mcp/server.ts) into a single ESM file.
 * tsconfig path aliases (@/*) are resolved at build time. Prisma is kept
 * external so its generated client + query engine load from node_modules.
 */
export default defineConfig({
  entry: { server: "mcp/server.ts" },
  outDir: "mcp/dist",
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  dts: false,
  sourcemap: false,
  external: ["@prisma/client", ".prisma/client"],
  outExtension() {
    return { js: ".mjs" };
  },
});
