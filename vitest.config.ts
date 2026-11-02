import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node", setupFiles: ["tests/setup.ts"], testTimeout: 20_000 },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
