const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts, evaluate } = require("./helpers/load");

function loadCommon() {
  return loadScripts(["common.js"]);
}

test("formats copper as gold, silver and copper", () => {
  const context = loadCommon();
  assert.equal(context.formatMoney(0), "0c");
  assert.equal(context.formatMoney(5), "5c");
  assert.equal(context.formatMoney(1950), "19s 50c");
  assert.equal(context.formatMoney(203512), "20g 35s 12c");
  assert.equal(context.formatMoney(100000), "10g");
});

test("prefers the vendor unless the auction house is clearly cheaper", () => {
  const context = loadCommon();
  const vendor = { price: 500, where: "vendor" };
  assert.equal(context.preferredOffer(vendor, { price: 450, where: "auction house" }).where, "vendor");
  assert.equal(context.preferredOffer(vendor, { price: 300, where: "auction house" }).where, "auction house");
  assert.equal(context.preferredOffer(null, { price: 300, where: "auction house" }).where, "auction house");
  assert.equal(context.preferredOffer(vendor, null).where, "vendor");
});

test("applies five percent per Bartering rank", () => {
  const context = loadCommon();
  assert.equal(context.vendorDiscountRate(), 0);
  context.localStorage.setItem("foreverPlanner.crafting", JSON.stringify({ barteringRank: 2 }));
  assert.equal(Math.round(context.vendorDiscountRate() * 100), 10);
});

test("only counts vendors that are friendly to the character's faction", () => {
  const context = loadCommon();
  evaluate(context, 'state.questie = { items: { 4291: { sources: [{ type: "vendor", friendlyTo: "A" }] }, 2321: { sources: [{ type: "vendor", friendlyTo: "AH" }] } } }');
  assert.equal(context.isVendorSoldFor(4291, "H"), false);
  assert.equal(context.isVendorSoldFor(4291, "A"), true);
  assert.equal(context.isVendorSoldFor(2321, "H"), true);
  assert.equal(context.isVendorSoldFor(9999, "H"), false);
});

test("links a random-suffix item to its suffix on Wowhead", () => {
  const context = loadCommon();
  assert.equal(context.wowheadUrl({ id: 8214 }), "https://www.wowhead.com/forever/item=8214");
  assert.equal(context.wowheadUrl({ id: 8214, suffix: { bonusId: 12727 } }), "https://www.wowhead.com/forever/item=8214?bonus=12727");
});

test("uses the Wowhead icon for items known only to the simulator", () => {
  const context = loadCommon();
  evaluate(context, "state.settings = defaultSettings(); window.GAME_RULES = { unknownIconId: 134400 };");
  assert.equal(context.iconUrlForItem({ iconName: "inv_axe_02" }), "https://wow.zamimg.com/images/wow/icons/medium/inv_axe_02.jpg");
  assert.equal(context.iconUrlForItem({ icon: 135274 }), "https://render.worldofwarcraft.com/forever-eu/icons/56/135274.jpg");
});
