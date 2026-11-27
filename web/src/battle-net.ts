import { REGIONS, state } from "./state.ts";

interface Media {
  assets?: { key: string; value: string }[];
}

async function fetchAccessToken(): Promise<string> {
  if (state.accessToken !== null && Date.now() < state.accessTokenExpiresAt) {
    return state.accessToken;
  }
  const clientId = state.credentials.clientId;
  const clientSecret = state.credentials.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error("Add your Battle.net client ID and secret in Settings first.");
  }
  const response = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(clientId + ":" + clientSecret),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (response.status === 401) {
    throw new Error("Battle.net rejected the client ID or secret. Check them in Settings.");
  }
  if (!response.ok) {
    throw new Error("Battle.net login failed with status " + response.status + ".");
  }
  const payload = await response.json();
  state.accessToken = payload.access_token as string;
  state.accessTokenExpiresAt = Date.now() + (payload.expires_in - 60) * 1000;
  return state.accessToken;
}

export async function fetchFromBattleNet(path: string, namespacePrefix: string): Promise<unknown> {
  const region = state.settings.region;
  if (REGIONS.indexOf(region) === -1) {
    throw new Error("Unknown region \"" + region + "\". Pick a region in Settings.");
  }
  const token = await fetchAccessToken();
  const url = "https://" + region + ".api.blizzard.com" + path +
    "?namespace=" + namespacePrefix + "-forever-" + region + "&locale=en_GB";
  let cacheMode: RequestCache = "default";
  if (namespacePrefix === "profile") {
    cacheMode = "no-cache";
  }
  const response = await fetch(url, { headers: { "Authorization": "Bearer " + token }, cache: cacheMode });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Battle.net returned status " + response.status + " for " + path + ".");
  }
  return response.json();
}

export function mediaAsset(media: Media | null, assetKey: string): string | null {
  if (media === null) {
    return null;
  }
  for (const asset of media.assets || []) {
    if (asset.key === assetKey) {
      return asset.value;
    }
  }
  return null;
}
