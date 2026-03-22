#!/usr/bin/env bun
/**
 * Simple CLI to read tokens from the token-refresh SQLite DB.
 *
 * Usage:
 *   bun get-token.ts <provider>              # prints access_token
 *   bun get-token.ts <provider> --json        # full token JSON
 *   bun get-token.ts <provider> --field X     # specific field
 *   bun get-token.ts                          # list all providers
 */

import { Database } from "bun:sqlite";

const DB_PATH = process.env.TOKEN_DB_PATH || `${import.meta.dir}/data/tokens.db`;

const db = new Database(DB_PATH, { readonly: true });

const args = process.argv.slice(2);
const provider = args.find((a) => !a.startsWith("--"))?.toLowerCase();
const json = args.includes("--json");
const fieldIdx = args.indexOf("--field");
const field = fieldIdx >= 0 ? args[fieldIdx + 1] : null;

if (!provider) {
  const rows = db.query("SELECT provider, expires_at, updated_at FROM tokens ORDER BY provider").all() as any[];
  if (rows.length === 0) {
    console.log("No tokens stored.");
    process.exit(0);
  }
  const now = Math.floor(Date.now() / 1000);
  for (const row of rows) {
    const expiresIn = row.expires_at - now;
    const healthy = expiresIn > 0;
    console.log(
      `${healthy ? "✅" : "❌"} ${row.provider}  expires in ${Math.round(expiresIn / 60)}m  (updated ${new Date(row.updated_at * 1000).toISOString()})`,
    );
  }
  process.exit(0);
}

const token = db.query("SELECT * FROM tokens WHERE provider = ? LIMIT 1").get(provider) as any;

if (!token) {
  console.error(`No token found for provider: ${provider}`);
  process.exit(1);
}

if (json) {
  const now = Math.floor(Date.now() / 1000);
  console.log(
    JSON.stringify(
      { ...token, expires_in_seconds: token.expires_at - now },
      null,
      2,
    ),
  );
} else if (field) {
  if (!(field in token)) {
    console.error(`Unknown field: ${field}. Available: ${Object.keys(token).join(", ")}`);
    process.exit(1);
  }
  console.log(token[field]);
} else {
  // Default: just print access_token (easy to pipe)
  console.log(token.access_token);
}
