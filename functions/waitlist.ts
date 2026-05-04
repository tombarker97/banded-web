// Cloudflare Pages Function: POST /waitlist
//
// Handles the "Get early access" form on banded.uk. Writes to the
// `waitlist_emails` table in Supabase using the service role key, which
// bypasses the RLS policies on that table (which are deliberately empty).
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readEmailFromRequest(
  request: Request
): Promise<{ email: string; gotcha: string }> {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      email: typeof body.email === "string" ? body.email : "",
      gotcha: typeof body._gotcha === "string" ? body._gotcha : "",
    };
  }

  const form = await request.formData().catch(() => null);
  if (!form) return { email: "", gotcha: "" };
  return {
    email: String(form.get("email") || ""),
    gotcha: String(form.get("_gotcha") || ""),
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { ok: false, error: "Server is not configured." },
      500
    );
  }

  const { email: rawEmail, gotcha } = await readEmailFromRequest(request);

  // Honeypot trip — pretend success so bots don't retry.
  if (gotcha && gotcha.trim().length > 0) {
    return jsonResponse({ ok: true }, 200);
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return jsonResponse(
      { ok: false, error: "Please enter a valid email address." },
      400
    );
  }

  const userAgent = request.headers.get("User-Agent") || null;

  const supabaseRes = await fetch(`${env.SUPABASE_URL}/rest/v1/waitlist_emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      email,
      user_agent: userAgent,
      source: "banded.uk",
    }),
  });

  // Treat the unique-constraint violation on email as a soft success.
  if (supabaseRes.status === 409) {
    return jsonResponse({ ok: true, alreadyOnList: true }, 200);
  }

  if (!supabaseRes.ok) {
    return jsonResponse(
      { ok: false, error: "Could not save your email. Please try again." },
      502
    );
  }

  return jsonResponse({ ok: true }, 201);
};

export const onRequest: PagesFunction<Env> = async ({ request }) => {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
};
