export interface OAuthProvider {
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSeparator?: string;
  buildAuthParams?: (base: Record<string, string>) => Record<string, string>;
  buildTokenParams?: (base: Record<string, string>) => Record<string, string>;
}

import { whoopProvider } from "./whoop";
import { stravaProvider } from "./strava";

export const providers: Record<string, OAuthProvider> = {
  whoop: whoopProvider,
  strava: stravaProvider,
};

export function getProvider(provider: string): OAuthProvider | null {
  return providers[provider.toLowerCase()] ?? null;
}

export function listProviders(): OAuthProvider[] {
  return Object.values(providers);
}
