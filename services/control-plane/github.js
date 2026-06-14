/**
 * GitHub OAuth helpers for the control plane. Two entry points share the same
 * "GitHub user -> pugloo account -> token" tail:
 *   - device flow: the CLI obtains a GitHub access token itself, then POSTs it to
 *     /auth/github/exchange (no client secret needed on the server).
 *   - web flow: /auth/github/start -> GitHub -> /auth/github/callback?code; the
 *     server exchanges the code (needs the client secret) for an access token.
 */

const GH_API = "https://api.github.com";
const GH_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GH_TOKEN = "https://github.com/login/oauth/access_token";

export function authorizeUrl({ clientId, redirectUri, state }) {
  const u = new URL(GH_AUTHORIZE);
  u.searchParams.set("client_id", clientId);
  if (redirectUri) u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", "read:user user:email");
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeWebCode({ clientId, clientSecret, code, redirectUri }) {
  const r = await fetch(GH_TOKEN, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });
  const j = await r.json().catch(() => ({}));
  return j.access_token || null;
}

export async function fetchGithubUser(accessToken) {
  const r = await fetch(`${GH_API}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "pugloo-control-plane",
      Accept: "application/vnd.github+json",
    },
  });
  if (!r.ok) return null;
  return r.json(); // { id, login, email, created_at, ... }
}
