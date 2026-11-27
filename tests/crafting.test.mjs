import test from "node:test";
import assert from "node:assert/strict";
import { resetPlanner, run } from "./helpers/realm.mjs";
import { aggregatePlans, crafting, defaultCraftingList, indexRecipes, planList } from "../web/src/crafting-plan.ts";

const LEATHER = 2318;
const THREAD = 2320;
const ARMOR = 5000;
const POTION = 6000;

function setUp(options) {
  const { snapshot, state } = resetPlanner();
  snapshot.faction = "Horde";
  globalThis.FOREVER_CRAFTING_ITEMS = {
    [LEATHER]: { name: "Light Leather", quality: "COMMON", icon: 1, vendorPrice: 0 },
    [THREAD]: { name: "Coarse Thread", quality: "COMMON", icon: 2, vendorPrice: 10 },
    [ARMOR]: { name: "Leather Armor", quality: "UNCOMMON", icon: 3, vendorPrice: 0, bindOnPickup: options.bindOnPickup },
    [POTION]: { name: "Potion", quality: "COMMON", icon: 4, vendorPrice: 0 }
  };
  globalThis.FOREVER_RECIPES = options.recipes || [
    { id: 1, profession: "Leatherworking", itemId: ARMOR, quantity: 1, reagents: [[LEATHER, 4], [THREAD, 2]] }
  ];
  indexRecipes();
  state.questie = { items: { [THREAD]: { sources: [{ type: "vendor", npc: "Supplier" }] } } };
  state.tsm = { prices: options.prices || {} };
  state.inventory = options.inventory || null;
  crafting.list = Object.assign(defaultCraftingList(), { entries: options.entries, overrides: options.overrides || {} });
  return state;
}

function auction(copper) {
  return { marketValue: copper };
}

function holding(bags) {
  return { name: "Alt", faction: "Horde", ruleset: "Normal", bags: bags, bank: {}, mail: {}, auctions: {}, money: 0, professions: [], classKey: "" };
}

test("crafts when the materials cost less than the finished item", () => {
  setUp({ entries: [{ itemId: ARMOR, quantity: 1 }], prices: { [LEATHER]: auction(50), [ARMOR]: auction(1000) } });
  const plan = planList()[0];
  assert.equal(plan.root.mode, "craft");
  assert.equal(plan.root.cost, 4 * 50 + 2 * 10);
  assert.equal(plan.readyMadeCost, 1000);
  assert.deepEqual(plan.root.children.map(function childMode(child) { return child.mode; }), ["buy", "buy"]);
  assert.equal(plan.root.children[1].buyOffer.where, "vendor");
});

test("buys the finished item when that is cheaper than crafting it", () => {
  setUp({ entries: [{ itemId: ARMOR, quantity: 1 }], prices: { [LEATHER]: auction(500), [ARMOR]: auction(1000) } });
  const plan = planList()[0];
  assert.equal(plan.root.mode, "buy");
  assert.equal(plan.root.cost, 1000);
});

test("never buys a bind-on-pickup item from the auction house", () => {
  setUp({ bindOnPickup: true, entries: [{ itemId: ARMOR, quantity: 1 }], prices: { [LEATHER]: auction(500), [ARMOR]: auction(1000) } });
  const plan = planList()[0];
  assert.equal(plan.root.mode, "craft");
  assert.equal(plan.readyMadeCost, null);
});

test("uses materials you own first and buys only the rest", () => {
  setUp({
    entries: [{ itemId: ARMOR, quantity: 1 }],
    prices: { [LEATHER]: auction(50) },
    inventory: { characters: { Alt: holding({ [LEATHER]: 3 }) }, modifiedAt: 0, accountCount: 1 }
  });
  const leather = planList()[0].root.children[0];
  assert.equal(leather.mode, "own");
  assert.equal(leather.ownUsed, 3);
  assert.equal(leather.buyQuantity, 1);
  assert.equal(leather.cost, 50);
  assert.deepEqual(leather.taken, [{ character: "Alt", place: "bags", count: 3 }]);
});

test("ignores inventory from another ruleset or faction", () => {
  const other = holding({ [LEATHER]: 10 });
  other.faction = "Alliance";
  setUp({ entries: [{ itemId: ARMOR, quantity: 1 }], prices: { [LEATHER]: auction(50) }, inventory: { characters: { Alt: other }, modifiedAt: 0, accountCount: 1 } });
  crafting.list.scope = "Normal|Horde";
  assert.equal(planList()[0].root.children[0].ownUsed, 0);
});

test("a chosen mode wins, and craft falls back when there is no recipe", () => {
  setUp({ entries: [{ itemId: ARMOR, quantity: 1 }], prices: { [LEATHER]: auction(50), [ARMOR]: auction(5000), [THREAD]: auction(5) }, overrides: { [ARMOR]: "ah", [THREAD]: "craft" } });
  let plan = planList()[0];
  assert.equal(plan.root.mode, "ah");
  assert.equal(plan.root.cost, 5000);
  crafting.list.overrides = { [THREAD]: "craft" };
  plan = planList()[0];
  assert.equal(plan.root.children[1].mode, "buy");
});

test("a recipe cycle doesn't loop forever", () => {
  setUp({
    entries: [{ itemId: POTION, quantity: 1 }],
    recipes: [
      { id: 2, profession: "Alchemy", itemId: POTION, quantity: 1, reagents: [[LEATHER, 1]] },
      { id: 3, profession: "Alchemy", itemId: LEATHER, quantity: 1, reagents: [[POTION, 1]] }
    ]
  });
  const plan = planList()[0];
  assert.equal(plan.root.mode, "craft");
  assert.equal(plan.root.missingPrice, true);
});

test("totals add up shopping, what to take from alts and the professions", () => {
  setUp({
    entries: [{ itemId: ARMOR, quantity: 2 }],
    prices: { [LEATHER]: auction(50) },
    inventory: { characters: { Alt: holding({ [LEATHER]: 5 }) }, modifiedAt: 0, accountCount: 1 }
  });
  const totals = aggregatePlans(planList());
  assert.deepEqual(totals.professions, ["Leatherworking"]);
  assert.deepEqual(totals.taking, [{ character: "Alt", itemId: LEATHER, places: { bags: 5 }, count: 5 }]);
  const shopping = totals.shopping.map(function lineOf(line) { return [line.itemId, line.quantity, line.cost]; });
  assert.deepEqual(shopping, [[LEATHER, 3, 150], [THREAD, 4, 40]]);
  assert.equal(totals.total, 190);
  assert.equal(totals.missing, false);
  assert.equal(run("state.inventory.characters.Alt.bags[" + LEATHER + "]"), 5);
});

test("changing the Bartering rank updates the plan without a manual redraw", async () => {
  const { computed } = await import("vue");
  setUp({ entries: [{ itemId: ARMOR, quantity: 1 }], prices: { [LEATHER]: auction(50), [ARMOR]: auction(5000) } });
  const total = computed(function planTotal() {
    return aggregatePlans(planList()).total;
  });
  assert.equal(total.value, 4 * 50 + 2 * 10);
  crafting.list.barteringRank = 2;
  assert.equal(total.value, 4 * 50 + 2 * 9);
});

test("in list order the first craft takes your materials; switched off, each craft can use all of them", () => {
  const inventory = { characters: { Alt: holding({ [LEATHER]: 4 }) }, modifiedAt: 0, accountCount: 1 };
  setUp({ entries: [{ itemId: ARMOR, quantity: 1 }, { itemId: ARMOR, quantity: 1 }], prices: { [LEATHER]: auction(50), [ARMOR]: auction(5000) }, inventory: inventory });
  crafting.list.entries = [{ itemId: ARMOR, quantity: 1 }, { itemId: 5001, quantity: 1 }];
  crafting.recipesByItem.set(5001, [{ id: 9, profession: "Leatherworking", itemId: 5001, quantity: 1, reagents: [[LEATHER, 4]] }]);
  let plans = planList();
  assert.equal(plans[0].root.children[0].ownUsed, 4);
  assert.equal(plans[1].root.children[0].ownUsed, 0);
  crafting.list.sharesMaterials = false;
  plans = planList();
  assert.equal(plans[0].root.children[0].ownUsed, 4);
  assert.equal(plans[1].root.children[0].ownUsed, 4);
});
