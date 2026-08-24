import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(async ({ mode }) => {
  const plugins = [react()];
  if (mode !== "test" && mode !== "domestic") {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(cloudflare());
  }

  return {
    plugins,
    build: mode === "domestic" ? { outDir: "dist/client" } : undefined,
  };
});
