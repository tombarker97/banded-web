# banded-web

Static marketing site for Banded, hosted on Cloudflare Pages.

## Pages

- `/` — landing page with early-access email signup
- `/privacy` — Privacy Policy
- `/terms` — Terms of Service
- `/data` — Data Sources & attribution
- `/support` — Support / FAQ

## Email signup

`/waitlist` is a Cloudflare Pages Function (`functions/waitlist.ts`) that
writes to the Supabase `public.waitlist_emails` table.

### Required Cloudflare Pages environment variables

In the Cloudflare Pages project (Production + Preview), set:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://ardeuampcqtohrlibjip.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role JWT for the gigdiary project |

The service role key bypasses RLS — it must only be set as a Pages **secret**,
never committed to the repo or exposed to the browser.

### Monitoring signups

Supabase Studio → Table Editor → `waitlist_emails` shows live entries. To
export, run in the SQL editor:

```sql
select email, created_at from public.waitlist_emails order by created_at desc;
```
