import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://niu.io",
  output: "static",
  trailingSlash: "always",
  devToolbar: { enabled: false },
});
