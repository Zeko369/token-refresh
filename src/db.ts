import { Database } from "bun:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export type TokenRecord = {
  provider: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string | null;
  token_type: string | null;
  updated_at: number;
};

const dbPath = process.env.DATABASE_PATH || "./data/tokens.db";
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath, { create: true });

db.exec(`
CREATE TABLE IF NOT EXISTS tokens (
  provider TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  scope TEXT,
  token_type TEXT DEFAULT 'bearer',
  updated_at INTEGER NOT NULL
);
`);

const upsertStmt = db.query(
  `
  INSERT INTO tokens (provider, access_token, refresh_token, expires_at, scope, token_type, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(provider) DO UPDATE SET
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at,
    scope = excluded.scope,
    token_type = excluded.token_type,
    updated_at = excluded.updated_at
`,
);

const getTokenStmt = db.query(`SELECT * FROM tokens WHERE provider = ? LIMIT 1`);
const getAllStmt = db.query(`SELECT * FROM tokens ORDER BY provider`);

export function upsertToken(record: Omit<TokenRecord, "updated_at">) {
  const now = Math.floor(Date.now() / 1000);
  upsertStmt.run(
    record.provider,
    record.access_token,
    record.refresh_token,
    record.expires_at,
    record.scope,
    record.token_type ?? "bearer",
    now,
  );
}

export function getToken(provider: string): TokenRecord | null {
  return (getTokenStmt.get(provider) as TokenRecord | null) ?? null;
}

export function getAllTokens(): TokenRecord[] {
  return getAllStmt.all() as TokenRecord[];
}
