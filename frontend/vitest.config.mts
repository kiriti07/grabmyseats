import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same "@/..." imports as the app (tsconfig.json paths).
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // tsconfig.json leaves JSX to Next ("preserve"); component tests
  // (rendered with react-dom/server, no DOM needed) need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
