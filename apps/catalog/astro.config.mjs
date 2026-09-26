import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://niu.io",
  output: "static",
  build: { assets: "_catalog" },
  trailingSlash: "always",
  devToolbar: { enabled: false },
});
