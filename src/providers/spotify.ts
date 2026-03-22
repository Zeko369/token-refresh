import type { OAuthProvider } from "./index";

export const spotifyProvider: OAuthProvider = {
  name: "spotify",
  authUrl: "https://accounts.spotify.com/authorize",
  tokenUrl: "https://accounts.spotify.com/api/token",
  scopes: [
    "user-top-read",
    "user-read-recently-played",
    "user-library-read",
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-private",
    "playlist-modify-public",
  ],
  buildAuthParams: (base) => ({
    ...base,
    show_dialog: "true",
  }),
  buildTokenParams: (base) => {
    // Spotify wants client_id + client_secret in the body (not Basic auth)
    return base;
  },
};
