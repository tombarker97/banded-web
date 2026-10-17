import type { APIContext } from "astro";
import { loadWeeks, type GigWeek } from "~/lib/gig-guide";
import { renderOgPng } from "~/lib/og";

export const prerender = true;

export function getStaticPaths() {
  return loadWeeks().map((week) => ({
    params: { week: week.weekStart },
    props: { week },
  }));
}

export async function GET({ props }: APIContext<{ week: GigWeek }>): Promise<Response> {
  const { week } = props;
  const png = await renderOgPng({
    eyebrow: `${week.city} gig guide`,
    title: week.rangeLabel,
    subtitle: `${week.gigCount} hand-picked gigs${
      week.cover.headliner ? `, from ${week.cover.headliner}` : ""
    }. Tickets in one tap.`,
    backgroundImageUrl: week.cover.imageUrl,
  });

  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
