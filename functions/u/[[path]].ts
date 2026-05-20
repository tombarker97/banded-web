// Cloudflare Pages Function — proxies /u/* to the Banded backend on Railway.
//
// Profile share pages (banded.uk/u/{username}) and their preview images
// (banded.uk/u/{username}/og.png) are server-rendered by the Express backend
// at api.banded.uk. This Function forwards each request and streams the
// response straight back, so the address bar keeps showing banded.uk/u/...
//
// It is a 200 rewrite, not a 30x redirect: link-preview crawlers (iMessage,
// Slack, Twitter) need the Open Graph tags on a real 200 response at the
// shared URL. The [[path]] catch-all matches both the username segment and
// the /og.png sub-path. Every other banded.uk route is untouched.

const ORIGIN = "https://api.banded.uk";

export const onRequest: PagesFunction = async ({ request }) => {
  const incoming = new URL(request.url);
  const target = ORIGIN + incoming.pathname + incoming.search;
  return fetch(new Request(target, request));
};
