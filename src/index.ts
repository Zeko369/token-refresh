import { Hono } from "hono";
import { getAllTokens, getToken, upsertToken } from "./db";
import { apiKeyAuth } from "./middleware";
import { getProvider, listProviders } from "./providers";
import { refreshProviderToken, startAutoRefresh } from "./refresh";

const app = new Hono();

function providerCredentials(providerName: string) {
  const key = providerName.toUpperCase();
  return {
    clientId: process.env[`${key}_CLIENT_ID`] ?? "",
    clientSecret: process.env[`${key}_CLIENT_SECRET`] ?? "",
  };
}

function callbackUrl(providerName: string) {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/auth/${providerName}/callback`;
}

function makeTokenShape(token: ReturnType<typeof getToken>) {
  if (!token) return null;
  return {
    provider: token.provider,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_at,
    scope: token.scope,
    token_type: token.token_type,
    updated_at: token.updated_at,
    expires_in_seconds: token.expires_at - Math.floor(Date.now() / 1000),
  };
}

app.get("/", (c) => {
  const providers = listProviders().map((p) => ({
    name: p.name,
    auth_path: `/auth/${p.name}`,
    callback_path: `/auth/${p.name}/callback`,
    scopes: p.scopes,
  }));

  return c.html(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Token Refresh Service</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; margin: 2rem; max-width: 840px; }
      h1 { margin-bottom: 0.3rem; }
      .card { border: 1px solid #ddd; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; }
      code { background: #f6f6f6; padding: 0.1rem 0.25rem; border-radius: 4px; }
      a { color: #0d6efd; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <h1>OAuth Token Refresh Service</h1>
    <p>Provider-agnostic OAuth token store and refresher.</p>
    ${providers
      .map(
        (p) => `<div class="card">
            <h2>${p.name}</h2>
            <p><a href="${p.auth_path}">Connect ${p.name}</a></p>
            <p>Auth: <code>${p.auth_path}</code><br/>Callback: <code>${p.callback_path}</code></p>
            <p>Scopes: <code>${p.scopes.join(" ")}</code></p>
          </div>`,
      )
      .join("\n")}
    <p>Private endpoints require <code>X-Api-Key</code>.</p>
  </body>
</html>`);
});

app.get("/auth/:provider", (c) => {
  const providerName = c.req.param("provider").toLowerCase();
  const provider = getProvider(providerName);
  if (!provider) return c.json({ error: "Unknown provider" }, 404);

  const { clientId } = providerCredentials(provider.name);
  if (!clientId) {
    return c.json({ error: `Missing ${provider.name.toUpperCase()}_CLIENT_ID` }, 500);
  }

  const state = crypto.randomUUID().replace(/-/g, "");
  const baseParams: Record<string, string> = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl(provider.name),
    scope: provider.scopes.join(provider.scopeSeparator ?? " "),
    state,
  };
  const authParams = provider.buildAuthParams ? provider.buildAuthParams(baseParams) : baseParams;

  const url = new URL(provider.authUrl);
  url.search = new URLSearchParams(authParams).toString();
  return c.redirect(url.toString(), 302);
});

app.get("/auth/:provider/callback", async (c) => {
  const providerName = c.req.param("provider").toLowerCase();
  const provider = getProvider(providerName);
  if (!provider) return c.json({ error: "Unknown provider" }, 404);

  const code = c.req.query("code");
  if (!code) return c.json({ error: "Missing code" }, 400);

  const { clientId, clientSecret } = providerCredentials(provider.name);
  if (!clientId || !clientSecret) {
    return c.json(
      {
        error: `Missing ${provider.name.toUpperCase()}_CLIENT_ID or ${provider.name.toUpperCase()}_CLIENT_SECRET`,
      },
      500,
    );
  }

  const baseParams: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUrl(provider.name),
  };
  const tokenParams = provider.buildTokenParams ? provider.buildTokenParams(baseParams) : baseParams;

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(tokenParams),
  });

  if (!response.ok) {
    const body = await response.text();
    return c.json({ error: "Token exchange failed", status: response.status, body }, 400);
  }

  const payload = await response.json();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(payload.expires_in ?? 0);
  const expiresAtFromProvider = Number(payload.expires_at ?? 0);
  const expiresAt =
    Number.isFinite(expiresAtFromProvider) && expiresAtFromProvider > 0
      ? expiresAtFromProvider
      : now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600);

  const accessToken = String(payload.access_token ?? "");
  const refreshToken = String(payload.refresh_token ?? "");

  if (!accessToken || !refreshToken) {
    return c.json({ error: "Token response missing access_token or refresh_token", payload }, 400);
  }

  upsertToken({
    provider: provider.name,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    scope: payload.scope ? String(payload.scope) : null,
    token_type: payload.token_type ? String(payload.token_type) : "bearer",
  });

  return c.json({
    ok: true,
    provider: provider.name,
    token: makeTokenShape(getToken(provider.name)),
  });
});

app.get("/tokens/:provider", apiKeyAuth, (c) => {
  const providerName = c.req.param("provider").toLowerCase();
  const provider = getProvider(providerName);
  if (!provider) return c.json({ error: "Unknown provider" }, 404);

  const token = getToken(provider.name);
  if (!token) return c.json({ error: "Token not found" }, 404);

  return c.json({ provider: provider.name, token: makeTokenShape(token) });
});

app.post("/refresh/:provider", apiKeyAuth, async (c) => {
  const providerName = c.req.param("provider").toLowerCase();
  const provider = getProvider(providerName);
  if (!provider) return c.json({ error: "Unknown provider" }, 404);

  const token = getToken(provider.name);
  if (!token) return c.json({ error: "Token not found" }, 404);

  const result = await refreshProviderToken(provider, token);
  if (!result.ok) return c.json(result, 400);

  return c.json(result);
});

app.get("/status", apiKeyAuth, (c) => {
  const now = Math.floor(Date.now() / 1000);
  const byProvider = new Map(getAllTokens().map((t) => [t.provider, t]));

  const status = listProviders().map((provider) => {
    const token = byProvider.get(provider.name);
    if (!token) {
      return {
        provider: provider.name,
        connected: false,
        healthy: false,
        message: "No token stored",
      };
    }

    const expiresIn = token.expires_at - now;
    return {
      provider: provider.name,
      connected: true,
      healthy: expiresIn > 0,
      expires_at: token.expires_at,
      expires_in_seconds: expiresIn,
      updated_at: token.updated_at,
    };
  });

  return c.json({ now, providers: status });
});

startAutoRefresh(listProviders());

const port = Number(process.env.PORT || 3000);
console.log(`Server listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
