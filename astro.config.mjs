import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  site: "https://banded.uk",
  output: "static",
  trailingSlash: "ignore",
  integrations: [
    mdx(),
    sitemap({
      changefreq: "weekly",
      lastmod: new Date(),
      filter: (page) =>
        // Don't list the OG image endpoints or Pages Functions in the sitemap.
        !page.includes("/og/") && !page.includes("/waitlist") && !page.includes("/supporters"),
    }),
  ],
  build: {
    format: "directory",
  },
  vite: {
    ssr: {
      // satori and resvg-js have native bits; keep them external so Astro's
      // build doesn't try to bundle them.
      external: ["@resvg/resvg-js"],
    },
  },
});
