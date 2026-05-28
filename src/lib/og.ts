import { html } from "satori-html";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

/**
 * Open Graph image generation for Banded.
 *
 * Satori only understands flex layout — every multi-child element needs an
 * explicit `display: flex`. We bake that into the template below.
 */

let fontCache: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;

  async function fetchWeight(weight: 400 | 700): Promise<ArrayBuffer> {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/3.6",
        },
      },
    ).then((r) => r.text());

    const urlMatch = css.match(/url\((https:[^)]+)\)/);
    if (!urlMatch) {
      throw new Error(`Could not extract Inter ${weight} URL from Google Fonts CSS`);
    }

    const fontRes = await fetch(urlMatch[1]);
    if (!fontRes.ok) {
      throw new Error(`Failed to fetch Inter ${weight} font (${fontRes.status})`);
    }
    return await fontRes.arrayBuffer();
  }

  const [regular, bold] = await Promise.all([fetchWeight(400), fetchWeight(700)]);
  fontCache = { regular, bold };
  return fontCache;
}

export interface OgImageProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

const WIDTH = 1200;
const HEIGHT = 630;

export async function renderOgPng({
  title,
  subtitle,
  eyebrow,
}: OgImageProps): Promise<Uint8Array> {
  const fonts = await loadFonts();

  const eyebrowText = eyebrow ?? "Banded";
  const eyebrowColor = eyebrow ? "#3B82F6" : "#8B9DC3";
  const titleSize = title.length > 60 ? 60 : 76;

  const markup = html(`
    <div style="
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      background: #080810;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 72px 80px;
      font-family: Inter;
      color: #FFFFFF;
    ">
      <div style="
        display: flex;
        font-size: 22px;
        font-weight: 700;
        color: ${eyebrowColor};
        letter-spacing: 2px;
        text-transform: uppercase;
      ">${escapeHtml(eyebrowText)}</div>

      <div style="
        display: flex;
        flex-direction: column;
      ">
        <div style="
          display: flex;
          font-size: ${titleSize}px;
          font-weight: 700;
          line-height: 1.1;
          letter-spacing: -2px;
          color: #FFFFFF;
          margin-bottom: 24px;
        ">${escapeHtml(title)}</div>
        ${
          subtitle
            ? `<div style="
                display: flex;
                font-size: 28px;
                font-weight: 400;
                line-height: 1.4;
                color: #C8D1E0;
                max-width: 900px;
              ">${escapeHtml(subtitle)}</div>`
            : ""
        }
      </div>

      <div style="
        display: flex;
        flex-direction: column;
      ">
        <div style="
          display: flex;
          font-size: 48px;
          font-weight: 700;
          letter-spacing: -1.5px;
          color: #FFFFFF;
          margin-bottom: 6px;
        ">Banded</div>
        <div style="
          display: flex;
          font-size: 20px;
          color: #8B9DC3;
        ">The social gig diary · banded.uk</div>
      </div>
    </div>
  `);

  const svg = await satori(markup, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Inter", data: fonts.regular, weight: 400, style: "normal" },
      { name: "Inter", data: fonts.bold, weight: 700, style: "normal" },
    ],
  });

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
  })
    .render()
    .asPng();

  return png;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
