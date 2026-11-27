import test from "node:test";
import assert from "node:assert/strict";
import { resetPlanner } from "./helpers/realm.mjs";
import { formatMoney, iconUrlForItem, isVendorSoldFor, preferredOffer, vendorDiscountRate, wowheadUrl } from "../web/src/prices.ts";

test("formats copper as gold, silver and copper", () => {
  assert.equal(formatMoney(0), "0c");
  assert.equal(formatMoney(5), "5c");
  assert.equal(formatMoney(1950), "19s 50c");
  assert.equal(formatMoney(203512), "20g 35s 12c");
  assert.equal(formatMoney(100000), "10g");
});

test("prefers the vendor unless the auction house is clearly cheaper", () => {
  const vendor = { price: 500, where: "vendor" };
  assert.equal(preferredOffer(vendor, { price: 450, where: "auction house" }).where, "vendor");
  assert.equal(preferredOffer(vendor, { price: 300, where: "auction house" }).where, "auction house");
  assert.equal(preferredOffer(null, { price: 300, where: "auction house" }).where, "auction house");
  assert.equal(preferredOffer(vendor, null).where, "vendor");
});

test("applies five percent per Bartering rank", () => {
  localStorage.clear();
  assert.equal(vendorDiscountRate(), 0);
  localStorage.setItem("foreverPlanner.crafting", JSON.stringify({ barteringRank: 2 }));
  assert.equal(Math.round(vendorDiscountRate() * 100), 10);
  localStorage.clear();
});

test("only counts vendors that are friendly to the character's faction", () => {
  const { state } = resetPlanner();
  state.questie = { items: { 4291: { sources: [{ type: "vendor", friendlyTo: "A" }] }, 2321: { sources: [{ type: "vendor", friendlyTo: "AH" }] } } };
  assert.equal(isVendorSoldFor(4291, "H"), false);
  assert.equal(isVendorSoldFor(4291, "A"), true);
  assert.equal(isVendorSoldFor(2321, "H"), true);
  assert.equal(isVendorSoldFor(9999, "H"), false);
});

test("links a random-suffix item to its suffix on Wowhead", () => {
  assert.equal(wowheadUrl({ id: 8214 }), "https://www.wowhead.com/forever/item=8214");
  assert.equal(wowheadUrl({ id: 8214, suffix: { bonusId: 12727 } }), "https://www.wowhead.com/forever/item=8214?bonus=12727");
});

test("uses the Wowhead icon for items known only to the simulator", () => {
  resetPlanner();
  assert.equal(iconUrlForItem({ iconName: "inv_axe_02" }), "https://wow.zamimg.com/images/wow/icons/medium/inv_axe_02.jpg");
  assert.equal(iconUrlForItem({ icon: 135274 }), "https://render.worldofwarcraft.com/forever-eu/icons/56/135274.jpg");
});
