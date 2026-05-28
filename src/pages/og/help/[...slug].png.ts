import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { renderOgPng } from "~/lib/og";

export const prerender = true;

export async function getStaticPaths() {
  const articles = await getCollection("help", ({ data }) => !data.draft);
  return articles.map((article) => ({
    params: { slug: article.id },
    props: { article },
  }));
}

interface Props {
  article: Awaited<ReturnType<typeof getCollection<"help">>>[number];
}

export async function GET({ props }: APIContext<Props>): Promise<Response> {
  const article = props.article;
  const png = await renderOgPng({
    title: article.data.ogTitle ?? article.data.title,
    subtitle: article.data.ogSubtitle ?? article.data.description,
    eyebrow: article.data.category ?? "Help",
  });

  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
