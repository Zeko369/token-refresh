import type { OAuthProvider } from "./index";

export const stravaProvider: OAuthProvider = {
  name: "strava",
  authUrl: "https://www.strava.com/oauth/authorize",
  tokenUrl: "https://www.strava.com/oauth/token",
  scopes: ["read", "activity:read_all", "activity:write"],
  scopeSeparator: ",",
  buildAuthParams: (base) => ({
    ...base,
    approval_prompt: "auto",
  }),
};
