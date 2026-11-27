import test from "node:test";
import assert from "node:assert/strict";
import { resetPlanner } from "./helpers/realm.mjs";
import { fetchFromBattleNet } from "../web/src/battle-net.ts";

test("character profiles always ask Battle.net, so Refresh never shows an old logout", async () => {
  const { state } = resetPlanner();
  state.credentials = { clientId: "id", clientSecret: "secret" };
  state.accessToken = null;
  const calls = [];
  globalThis.fetch = async function fakeFetch(url, options) {
    calls.push({ url: String(url), cache: options && options.cache });
    if (String(url).includes("oauth.battle.net")) {
      return { ok: true, status: 200, json: async function token() { return { access_token: "token", expires_in: 3600 }; } };
    }
    return { ok: true, status: 200, json: async function body() { return {}; } };
  };
  await fetchFromBattleNet("/profile/wow/character/test-hero", "profile");
  await fetchFromBattleNet("/data/wow/media/item/25", "static");
  const profileCall = calls.find(function isProfile(call) { return call.url.includes("/profile/"); });
  const mediaCall = calls.find(function isMedia(call) { return call.url.includes("/media/"); });
  assert.equal(profileCall.cache, "no-cache");
  assert.equal(mediaCall.cache, "default");
});
