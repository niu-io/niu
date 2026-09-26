import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://niu.io",
  output: "static",
  build: { assets: "_catalog" },
  trailingSlash: process.env.NIU_DEV_GATEWAY_URL ? "ignore" : "always",
  devToolbar: { enabled: false },
});
