import type { OAuthProvider } from "./index";

export const whoopProvider: OAuthProvider = {
  name: "whoop",
  authUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
  tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
  scopes: [
    "read:profile",
    "read:body_measurement",
    "read:workout",
    "read:recovery",
    "read:sleep",
    "read:cycles",
    "offline",
  ],
};
