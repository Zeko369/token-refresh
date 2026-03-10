import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { OAuthProvider } from "./providers";
import { getAllTokens, getToken, upsertToken, type TokenRecord } from "./db";

/**
 * Sync token to external consumer files (e.g. whoopskill's ~/.whoop-cli/tokens.json)
 */
const EXTERNAL_TOKEN_SINKS: Record<string, string> = {
  whoop: join(homedir(), ".whoop-cli", "tokens.json"),
};

export function syncToExternalFile(provider: string, token: TokenRecord) {
  const sinkPath = EXTERNAL_TOKEN_SINKS[provider];
  if (!sinkPath) return;

  try {
    const dir = join(sinkPath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

    const data = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: token.expires_at,
      token_type: token.token_type ?? "bearer",
      scope: token.scope ?? "",
    };
    writeFileSync(sinkPath, JSON.stringify(data, null, 2));
    console.log(`[sync] Wrote ${provider} token to ${sinkPath}`);
  } catch (err) {
    console.error(`[sync] Failed to write ${provider} token to ${sinkPath}:`, err);
  }
}

export type RefreshResult = {
  ok: boolean;
  provider: string;
  error?: string;
  token?: TokenRecord;
};

function getProviderEnv(providerName: string) {
  const key = providerName.toUpperCase();
  return {
    clientId: process.env[`${key}_CLIENT_ID`] ?? "",
    clientSecret: process.env[`${key}_CLIENT_SECRET`] ?? "",
  };
}

function parseTokenPayload(payload: any, fallbackRefreshToken?: string) {
  const expiresIn = Number(payload.expires_in ?? 0);
  const expiresAtFromProvider = Number(payload.expires_at ?? 0);
  const now = Math.floor(Date.now() / 1000);

  const expiresAt =
    Number.isFinite(expiresAtFromProvider) && expiresAtFromProvider > 0
      ? expiresAtFromProvider
      : now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600);

  return {
    access_token: String(payload.access_token ?? ""),
    refresh_token: String(payload.refresh_token ?? fallbackRefreshToken ?? ""),
    expires_at: expiresAt,
    scope: payload.scope ? String(payload.scope) : null,
    token_type: payload.token_type ? String(payload.token_type) : "bearer",
  };
}

export async function refreshProviderToken(
  provider: OAuthProvider,
  current: TokenRecord,
): Promise<RefreshResult> {
  const { clientId, clientSecret } = getProviderEnv(provider.name);
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      provider: provider.name,
      error: `Missing ${provider.name.toUpperCase()}_CLIENT_ID or ${provider.name.toUpperCase()}_CLIENT_SECRET`,
    };
  }

  const baseParams: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: current.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  };
  const tokenParams = provider.buildTokenParams
    ? provider.buildTokenParams(baseParams)
    : baseParams;

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(tokenParams),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      provider: provider.name,
      error: `Refresh failed (${response.status}): ${body}`,
    };
  }

  const payload = await response.json();
  const parsed = parseTokenPayload(payload, current.refresh_token);

  if (!parsed.access_token || !parsed.refresh_token) {
    return {
      ok: false,
      provider: provider.name,
      error: "Token response missing access_token or refresh_token",
    };
  }

  upsertToken({ provider: provider.name, ...parsed });
  const updated = getToken(provider.name);

  if (updated) syncToExternalFile(provider.name, updated);

  return {
    ok: true,
    provider: provider.name,
    token: updated ?? undefined,
  };
}

export function startAutoRefresh(providers: OAuthProvider[]) {
  const intervalMs = 30 * 60 * 1000;
  const thresholdSeconds = 60 * 60;

  const run = async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiring = getAllTokens().filter((t) => t.expires_at - now <= thresholdSeconds);

    for (const token of expiring) {
      const provider = providers.find((p) => p.name === token.provider);
      if (!provider) continue;

      try {
        const result = await refreshProviderToken(provider, token);
        if (!result.ok) {
          console.error(`[auto-refresh] ${provider.name}: ${result.error}`);
        }
      } catch (err) {
        console.error(`[auto-refresh] ${provider.name}:`, err);
      }
    }
  };

  run().catch((err) => console.error("[auto-refresh] initial run error", err));
  return setInterval(() => {
    run().catch((err) => console.error("[auto-refresh] interval run error", err));
  }, intervalMs);
}
