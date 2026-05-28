import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const posts = await getCollection("blog", ({ data }) => !data.draft);

  const sorted = posts.sort(
    (a, b) =>
      (b.data.publishedAt?.getTime() ?? 0) -
      (a.data.publishedAt?.getTime() ?? 0),
  );

  return rss({
    title: "Banded — Blog",
    description:
      "Guides, comparisons, and thinking about live music from the team building Banded.",
    site: context.site ?? "https://banded.uk",
    items: sorted.map((post) => ({
      title: post.data.title,
      pubDate: post.data.publishedAt,
      description: post.data.description,
      link: `/blog/${post.id}/`,
      categories: post.data.keywords,
    })),
    customData: "<language>en-gb</language>",
  });
}
