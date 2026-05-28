// Cloudflare Pages Function: GET /supporters
//
// Renders a server-side HTML page listing every active Banded Backstage
// subscriber's @username. Reads `public.profiles` from Supabase using the
// service-role key (bypasses RLS for the read), then renders HTML inline.
//
// The Backstage paywall in the iOS app promises subscribers "Your name on our
// Supporters page on the banded.uk website" — this is that page.
//
// `profiles.tier` is kept current in real-time by the RevenueCat webhook
// (backend/src/routes/revenueCatWebhook.ts), so a read on each request is the
// freshest possible source. Edge cache mitigates the per-request Supabase
// round-trip: 6h fresh, 24h stale-while-revalidate.
//
// Required environment variables (set in Cloudflare Pages → Settings → Environment variables):
//   SUPABASE_URL                — e.g. https://ardeuampcqtohrlibjip.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   — service-role JWT for the gigdiary project
//
// Both must only ever be set as Pages secrets — never embedded in HTML or client JS.

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface SupporterRow {
  username: string | null;
}

const CACHE_CONTROL = "public, s-maxage=21600, stale-while-revalidate=86400";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": status === 200 ? CACHE_CONTROL : "no-store",
    },
  });
}

async function fetchSupporters(env: Env): Promise<SupporterRow[]> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/profiles` +
    `?select=username` +
    `&tier=eq.backstage` +
    `&is_public=eq.true` +
    `&username=not.is.null` +
    `&order=username.asc`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Supabase REST returned ${res.status}`);
  }

  return (await res.json()) as SupporterRow[];
}

function renderPage(opts: { supporters: string[]; error: boolean }): string {
  const { supporters, error } = opts;
  const count = supporters.length;

  const listMarkup = error
    ? `<p class="empty-state">We couldn't load the supporters list right now — please refresh in a moment.</p>`
    : count === 0
    ? `<p class="empty-state">Be the first to support Banded — upgrade to Backstage in the app and your @username appears here.</p>`
    : `<ul class="supporters">${supporters
        .map((u) => `<li>@${escapeHtml(u)}</li>`)
        .join("")}</ul>`;

  const countLine = !error && count > 0
    ? `<p class="count">${count} Backstage ${count === 1 ? "supporter" : "supporters"}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Supporters — Banded</title>
    <meta name="description" content="The people who keep Banded going. Thank you to every Backstage subscriber.">
    <meta property="og:title" content="Supporters — Banded">
    <meta property="og:description" content="The people who keep Banded going. Thank you to every Backstage subscriber.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://banded.uk/supporters">
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            background: #080810;
            color: #FFFFFF;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.75;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        .container {
            max-width: 720px;
            margin: 0 auto;
            padding: 60px 24px 80px;
        }

        nav { margin-bottom: 48px; }

        nav a {
            color: #8B9DC3;
            text-decoration: none;
            font-size: 14px;
            transition: color 0.2s;
        }

        nav a:hover { color: #FFFFFF; }

        h1 {
            font-size: 32px;
            font-weight: 700;
            letter-spacing: -0.5px;
            margin-bottom: 8px;
        }

        .subtitle {
            color: #8B9DC3;
            font-size: 18px;
            margin-bottom: 32px;
            text-wrap: balance;
        }

        p { color: #C8D1E0; margin-bottom: 16px; }

        a {
            color: #3B82F6;
            text-decoration: none;
            transition: color 0.2s;
        }

        a:hover { color: #60A5FA; }

        .count {
            color: #8B9DC3;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            margin-bottom: 28px;
        }

        .supporters {
            list-style: none;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 10px 24px;
            padding: 24px 0;
            border-top: 1px solid rgba(139, 157, 195, 0.15);
            border-bottom: 1px solid rgba(139, 157, 195, 0.15);
            margin-bottom: 48px;
        }

        .supporters li {
            color: #FFFFFF;
            font-size: 16px;
            font-weight: 500;
            word-break: break-word;
        }

        .empty-state {
            background: rgba(139, 157, 195, 0.06);
            border: 1px solid rgba(139, 157, 195, 0.15);
            border-radius: 12px;
            padding: 28px;
            color: #C8D1E0;
            margin-bottom: 48px;
        }

        .gratitude {
            background: rgba(59, 130, 246, 0.06);
            border: 1px solid rgba(59, 130, 246, 0.15);
            border-radius: 12px;
            padding: 28px;
            margin-bottom: 48px;
        }

        .gratitude p { margin-bottom: 0; }

        footer {
            margin-top: 64px;
            padding-top: 24px;
            border-top: 1px solid rgba(139, 157, 195, 0.15);
            color: #8B9DC3;
            font-size: 14px;
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;
        }

        footer a { color: #8B9DC3; }
        footer a:hover { color: #FFFFFF; }

        @media (max-width: 480px) {
            .container { padding: 40px 18px 60px; }
            h1 { font-size: 26px; }
            .supporters { grid-template-columns: 1fr 1fr; gap: 8px 16px; }
            footer { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="container">
        <nav>
            <a href="/">&larr; Banded</a>
        </nav>

        <h1>Supporters</h1>
        <p class="subtitle">The people keeping Banded going. Every name below is a Banded Backstage subscriber — thank you.</p>

        <div class="gratitude">
            <p>Banded Backstage is our top tier — subscribers get every Pro feature, custom accent colours, a post boost in the feed, and our deepest gratitude. We couldn't do this without you.</p>
        </div>

        ${countLine}
        ${listMarkup}

        <footer>
            <span>&copy; 2026 Banded</span>
            <span>
                <a href="/">Home</a> &middot;
                <a href="/privacy">Privacy</a> &middot;
                <a href="/terms">Terms</a> &middot;
                <a href="/support">Support</a>
            </span>
        </footer>
    </div>
</body>
</html>`;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return htmlResponse(renderPage({ supporters: [], error: true }), 500);
  }

  try {
    const rows = await fetchSupporters(env);
    const supporters = rows
      .map((r) => (r.username ?? "").trim())
      .filter((u) => u.length > 0);
    return htmlResponse(renderPage({ supporters, error: false }));
  } catch {
    return htmlResponse(renderPage({ supporters: [], error: true }), 502);
  }
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => {
  const res = await onRequestGet(ctx);
  return new Response(null, { status: res.status, headers: res.headers });
};

export const onRequest: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 405,
    headers: { Allow: "GET, HEAD" },
  });
};
