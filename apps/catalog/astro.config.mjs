import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  integrations: [react()],
  vite: { plugins: [tailwindcss()], resolve: { alias: { "@": fileURLToPath(new URL("../dashboard/src", import.meta.url)) } } },
  site: "https://niu.io",
  output: "static",
  build: { assets: "_catalog" },
  trailingSlash: process.env.NIU_DEV_GATEWAY_URL ? "ignore" : "always",
  devToolbar: { enabled: false },
});
