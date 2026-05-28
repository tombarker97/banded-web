import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { renderOgPng } from "~/lib/og";

export const prerender = true;

export async function getStaticPaths() {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  return posts.map((post) => ({
    params: { slug: post.id },
    props: { post },
  }));
}

interface Props {
  post: Awaited<ReturnType<typeof getCollection<"blog">>>[number];
}

export async function GET({ props }: APIContext<Props>): Promise<Response> {
  const post = props.post;
  const png = await renderOgPng({
    title: post.data.ogTitle ?? post.data.title,
    subtitle: post.data.ogSubtitle ?? post.data.description,
    eyebrow: post.data.category ?? "Blog",
  });

  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
