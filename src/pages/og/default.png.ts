import type { APIContext } from "astro";
import { renderOgPng } from "~/lib/og";

export const prerender = true;

export async function GET(_context: APIContext): Promise<Response> {
  const png = await renderOgPng({
    title: "The social gig diary.",
    subtitle:
      "Log every show. Rate the experience. Share your live music history. Free on the App Store.",
  });

  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
