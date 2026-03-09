import type { Context, Next } from "hono";

export async function apiKeyAuth(c: Context, next: Next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return c.json({ error: "API_KEY is not configured" }, 500);
  }

  const incoming = c.req.header("X-Api-Key");
  if (!incoming || incoming !== apiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
}
