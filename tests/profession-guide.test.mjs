import test from "node:test";
import assert from "node:assert/strict";
import { resetPlanner, run } from "./helpers/realm.mjs";
import { crafting, defaultCraftingList, indexRecipes } from "../web/src/crafting-plan.ts";
import { buildGuide, levelingCosts, recipeColor, skillRankAt, skillUpChance } from "../web/src/profession-guide.ts";
import { compareProfessions, comparisonRows, costStillToBuy, professionChoices, shoppingRows, stageRows, startGuidePage } from "../web/src/ui/profession-page.ts";

const LINEN = 2589;
const WOOL = 2592;
const PATTERN = 9000;
const BOLT = 2996;
const COPPER_ROD = 6218;
const SILVER_ROD = 6339;
const DUST = 10940;

function setUp(options) {
  const { character, snapshot, state } = resetPlanner();
  snapshot.faction = "Horde";
  globalThis.FOREVER_CRAFTING_ITEMS = {
    [LINEN]: { name: "Linen Cloth", quality: "COMMON", icon: 1, vendorPrice: 0 },
    [WOOL]: { name: "Wool Cloth", quality: "COMMON", icon: 2, vendorPrice: 0 },
    [PATTERN]: { name: "Pattern: Fancy Wool", quality: "UNCOMMON", icon: 3, vendorPrice: 0 },
    [BOLT]: { name: "Bolt of Linen Cloth", quality: "COMMON", icon: 4, vendorPrice: 0 },
    [COPPER_ROD]: { name: "Runed Copper Rod", quality: "COMMON", icon: 5, vendorPrice: 0, bindOnPickup: true },
    [SILVER_ROD]: { name: "Runed Silver Rod", quality: "COMMON", icon: 6, vendorPrice: 0, bindOnPickup: true },
    [DUST]: { name: "Strange Dust", quality: "COMMON", icon: 7, vendorPrice: 0 }
  };
  globalThis.FOREVER_TOOLS = {
    categories: { 373: { name: "Runed Copper Rod", type: 3, mask: 1, itemId: COPPER_ROD }, 374: { name: "Runed Silver Rod", type: 3, mask: 3, itemId: SILVER_ROD } },
    items: { [COPPER_ROD]: 373, [SILVER_ROD]: 374 }
  };
  globalThis.FOREVER_RECIPES = options.recipes;
  globalThis.FOREVER_RECIPE_LEVELS = options.levels;
  globalThis.FOREVER_RECIPE_NAMES = {};
  indexRecipes();
  state.questie = { items: {} };
  state.tsm = { prices: options.prices };
  state.inventory = options.inventory || null;
  crafting.list = defaultCraftingList();
  return character;
}

function ANYONE() {
  return true;
}

function auction(copper) {
  return { marketValue: copper };
}

test("a recipe is a sure skill-up while orange and fades to nothing at grey", () => {
  const levels = [1, 25, 37, 50];
  assert.equal(skillUpChance(levels, 10), 1);
  assert.equal(skillUpChance(levels, 25), 1);
  assert.equal(skillUpChance(levels, 40), 0.4);
  assert.equal(skillUpChance(levels, 50), 0);
  assert.equal(recipeColor(levels, 24), "orange");
  assert.equal(recipeColor(levels, 30), "yellow");
  assert.equal(recipeColor(levels, 45), "green");
  assert.equal(recipeColor(levels, 50), "grey");
});

test("levels with the cheapest recipe per skill point and counts the expected crafts", () => {
  setUp({
    recipes: [
      { id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[LINEN, 1]] },
      { id: 2, profession: "Tailoring", itemId: 101, quantity: 1, reagents: [[WOOL, 1]] }
    ],
    levels: { 1: [1, 10, 15, 20], 2: [10, 20, 25, 30] },
    prices: { [LINEN]: auction(10), [WOOL]: auction(30) }
  });
  const guide = buildGuide("Tailoring", 1, 20, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.equal(guide.stuckAt, null);
  assert.deepEqual(guide.steps.map(function span(step) { return [step.recipeId, step.from, step.to, step.color]; }), [[1, 1, 17, "orange"], [2, 17, 20, "orange"]]);
  assert.equal(guide.steps[0].crafts, 20);
  assert.equal(guide.steps[1].crafts, 3);
  assert.equal(guide.total, guide.steps[0].cost + guide.steps[1].cost);
  assert.equal(guide.materials[0].itemId, LINEN);
});

test("does not use a recipe before it can be learned", () => {
  setUp({
    recipes: [
      { id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[LINEN, 1]] },
      { id: 2, profession: "Tailoring", itemId: 101, quantity: 1, reagents: [[WOOL, 1]] }
    ],
    levels: { 1: [1, 30, 40, 50], 2: [20, 40, 45, 50] },
    prices: { [LINEN]: auction(100), [WOOL]: auction(1) }
  });
  const guide = buildGuide("Tailoring", 1, 30, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.deepEqual(guide.steps.map(function span(step) { return [step.recipeId, step.from, step.to]; }), [[1, 1, 20], [2, 20, 30]]);
});

test("buys a pattern only when it pays off, and lists it once", () => {
  setUp({
    recipes: [
      { id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[LINEN, 2]] },
      { id: 2, profession: "Tailoring", itemId: 101, quantity: 1, reagents: [[WOOL, 1]], teachingItemId: PATTERN }
    ],
    levels: { 1: [1, 40, 45, 50], 2: [1, 40, 45, 50] },
    prices: { [LINEN]: auction(100), [WOOL]: auction(10), [PATTERN]: auction(500) }
  });
  const guide = buildGuide("Tailoring", 1, 40, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.deepEqual(guide.steps.map(function recipeOf(step) { return step.recipeId; }), [2]);
  assert.deepEqual(guide.lessons.map(function lessonOf(lesson) { return [lesson.recipeId, lesson.teachingItemId, lesson.cost]; }), [[2, PATTERN, 500]]);
  assert.equal(guide.total, 39 * 10 + 500);
});

test("a known recipe needs no pattern and no learning level", () => {
  setUp({
    recipes: [{ id: 2, profession: "Tailoring", itemId: 101, quantity: 1, reagents: [[WOOL, 1]], teachingItemId: PATTERN }],
    levels: { 2: [30, 40, 45, 50] },
    prices: { [WOOL]: auction(10) }
  });
  const guide = buildGuide("Tailoring", 10, 20, { knownRecipeIds: [2], canCraft: ANYONE, ownedTools: [] });
  assert.equal(guide.lessons.length, 0);
  assert.equal(guide.steps[0].crafts, 10);
});

test("stops where no recipe gives skill", () => {
  setUp({
    recipes: [{ id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[LINEN, 1]] }],
    levels: { 1: [1, 10, 15, 20] },
    prices: { [LINEN]: auction(10) }
  });
  const guide = buildGuide("Tailoring", 1, 40, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.equal(guide.stuckAt, 20);
});

test("adds up materials across steps and lists the dearest first", async () => {
  const { sumMaterials } = await import("../web/src/profession-guide.ts");
  function unitCost(itemId) {
    return { [LINEN]: 10, [WOOL]: 30 }[itemId];
  }
  function isCrafted(itemId) {
    return itemId === WOOL;
  }
  const steps = [
    { reagents: [[LINEN, 2]], crafts: 5 },
    { reagents: [[LINEN, 1], [WOOL, 1]], crafts: 3 }
  ];
  assert.deepEqual(sumMaterials(steps, { unitCost: unitCost, isCrafted: isCrafted }), [
    { itemId: LINEN, quantity: 13, cost: 130, craft: false },
    { itemId: WOOL, quantity: 3, cost: 90, craft: true }
  ]);
});

const LINEN_FROM_70_TO_80 = {
  recipes: [{ id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[LINEN, 1]] }],
  levels: { 1: [1, 100, 120, 140] },
  prices: { [LINEN]: auction(10) }
};

test("starts a new step where a trainer rank ends", () => {
  setUp(LINEN_FROM_70_TO_80);
  const guide = buildGuide("Tailoring", 70, 80, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.deepEqual(guide.steps.map(function span(step) { return [step.recipeId, step.from, step.to, step.crafts]; }), [[1, 70, 75, 5], [1, 75, 80, 5]]);
  assert.equal(skillRankAt(74).name, "Apprentice");
  assert.equal(skillRankAt(75).name, "Journeyman");
  assert.equal(skillRankAt(300).name, "Artisan");
});

test("splits a plan into rank stages, each with its own shopping list and a running total", () => {
  const character = setUp(LINEN_FROM_70_TO_80);
  const guide = buildGuide("Tailoring", 70, 80, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  const saved = { createdAt: 0, guide: guide, doneSteps: [], boughtMaterials: ["Apprentice:" + LINEN] };
  const stages = stageRows(saved, null, character);
  assert.deepEqual(stages.map(function titleOf(stage) { return stage.title; }), ["Apprentice 70 → 75", "Journeyman 75 → 80"]);
  assert.equal(stages[0].training, "");
  assert.match(stages[1].training, /train Journeyman/);
  assert.deepEqual(stages.map(function totals(stage) { return [stage.cost, stage.runningTotal]; }), [[50, 50], [50, 100]]);
  assert.equal(stages[0].materials[0].bought, true);
  assert.equal(stages[1].materials[0].bought, false);
  assert.deepEqual(shoppingRows(stages).map(function row(entry) { return [entry.itemId, entry.quantity, entry.cost]; }), [[LINEN, "5×", 50]]);
  assert.equal(costStillToBuy(stages), 50);
});

test("moves materials ticked before stages existed into the stages that use them", () => {
  const character = setUp(LINEN_FROM_70_TO_80);
  const guide = buildGuide("Tailoring", 70, 80, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  character.professionGuides = { Tailoring: { createdAt: 0, guide: guide, doneSteps: [], boughtItemIds: [LINEN, WOOL] } };
  startGuidePage();
  assert.deepEqual(character.professionGuides.Tailoring.boughtMaterials, ["Apprentice:" + LINEN, "Journeyman:" + LINEN]);
  assert.equal(character.professionGuides.Tailoring.boughtItemIds, undefined);
});

function alt(bags) {
  return { characters: { Alt: { name: "Alt", faction: "Horde", ruleset: "Normal", bags: bags, bank: {}, mail: {}, auctions: {}, money: 0, professions: [], classKey: "" } }, modifiedAt: 0, accountCount: 1 };
}

test("uses what your characters have before buying, in stage order", () => {
  const character = setUp(Object.assign({ inventory: alt({ [LINEN]: 7 }) }, LINEN_FROM_70_TO_80));
  const guide = buildGuide("Tailoring", 70, 80, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  const stages = stageRows({ createdAt: 0, guide: guide, doneSteps: [], boughtMaterials: [] }, null, character);
  assert.equal(stages[0].hasMaterials, false);
  assert.deepEqual(stages[0].taking.map(function row(entry) { return [entry.quantity, entry.places]; }), [["5×", "Alt: 5 in bags"]]);
  assert.deepEqual(stages[1].materials.map(function row(entry) { return [entry.itemId, entry.quantity, entry.cost]; }), [[LINEN, "3×", 30]]);
  assert.equal(stages[1].taking[0].quantity, "2×");
  assert.equal(costStillToBuy(stages), 30);
});

const SHIRTS_FROM_BOLTS = {
  recipes: [
    { id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[BOLT, 1]] },
    { id: 5, profession: "Mining", itemId: BOLT, quantity: 1, reagents: [[LINEN, 2]] }
  ],
  levels: { 1: [1, 100, 120, 140] },
  prices: { [LINEN]: auction(10), [BOLT]: auction(100) }
};

test("crafts a cheaper material first and buys its materials instead", () => {
  const character = setUp(SHIRTS_FROM_BOLTS);
  run("state.snapshots['test-hero'].professions = [{ name: 'Mining', skillPoints: 50, recipeIds: [] }]");
  const guide = buildGuide("Tailoring", 1, 5, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  const stages = stageRows({ createdAt: 0, guide: guide, doneSteps: [], boughtMaterials: [] }, null, character);
  assert.equal(stages[0].steps[0].craftFirst, "Craft first: 4× Bolt of Linen Cloth");
  assert.deepEqual(stages[0].materials.map(function row(entry) { return [entry.itemId, entry.quantity]; }), [[LINEN, "8×"]]);
});

test("buys a material made by a profession the character doesn't have", () => {
  const character = setUp(SHIRTS_FROM_BOLTS);
  const guide = buildGuide("Tailoring", 1, 5, { knownRecipeIds: [], canCraft: function onlyTailoring(recipe) { return recipe.profession === "Tailoring"; }, ownedTools: [] });
  assert.equal(guide.steps[0].unitCost, 100);
  const stages = stageRows({ createdAt: 0, guide: guide, doneSteps: [], boughtMaterials: [] }, null, character);
  assert.equal(stages[0].steps[0].craftFirst, "");
  assert.deepEqual(stages[0].materials.map(function row(entry) { return [entry.itemId, entry.quantity, entry.cost]; }), [[BOLT, "4×", 400]]);
});

test("adds up what a profession costs up to each trainer rank, and none past where it gets stuck", () => {
  setUp({
    recipes: [{ id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[LINEN, 1]] }],
    levels: { 1: [1, 250, 260, 270] },
    prices: { [LINEN]: auction(10) }
  });
  assert.deepEqual(levelingCosts("Tailoring", ANYONE), [1490, 2240, null]);
});

function namesOf(character) {
  return professionChoices(character).map(function labelOf(choice) { return choice.label; });
}

test("lists only a character's own crafts and the secondary professions once it has two primaries", () => {
  const character = setUp(LINEN_FROM_70_TO_80);
  assert.equal(namesOf(character)[0], "Alchemy");
  run("state.snapshots['test-hero'].professions = [{ name: 'Leatherworking', skillPoints: 50 }, { name: 'Cooking', skillPoints: 10 }]");
  assert.deepEqual(namesOf(character).slice(0, 3), ["Leatherworking (yours)", "Cooking (yours)", "Alchemy"]);
  assert.equal(namesOf(character).length, 8);
  run("state.snapshots['test-hero'].professions.push({ name: 'Skinning', skillPoints: 50 })");
  assert.deepEqual(namesOf(character), ["Leatherworking", "Cooking", "First Aid"]);
});

test("says which trainer teaches a recipe and shows its recipe for one craft", () => {
  const character = setUp({
    recipes: [{ id: 1, profession: "Tailoring", itemId: 100, quantity: 2, reagents: [[LINEN, 3]] }],
    levels: { 1: [160, 200, 210, 230] },
    prices: { [LINEN]: auction(10) }
  });
  run("state.questie = null");
  const guide = buildGuide("Tailoring", 160, 170, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  const stages = stageRows({ createdAt: 0, guide: guide, doneSteps: [], boughtMaterials: [] }, null, character);
  assert.equal(stages[0].lessons[0].where, "From a trainer at skill 160");
  assert.equal(stages[0].lessons[0].source.text, "An Expert Tailor");
  assert.deepEqual(stages[0].steps[0].recipe.lines, [{ className: "", text: "3× Linen Cloth" }]);
  assert.equal(stages[0].steps[0].recipe.subtitle, "One craft makes 2 and takes:");
});

const ENCHANTING = {
  recipes: [
    { id: 10, profession: "Enchanting", itemId: COPPER_ROD, quantity: 1, reagents: [[DUST, 1]] },
    { id: 11, profession: "Enchanting", itemId: SILVER_ROD, quantity: 1, reagents: [[DUST, 3]] },
    { id: 12, profession: "Enchanting", itemId: null, quantity: 1, reagents: [[DUST, 1]], tools: [373] },
    { id: 13, profession: "Enchanting", itemId: null, quantity: 1, reagents: [[DUST, 2]], tools: [374] }
  ],
  levels: { 10: [1, 1, 1, 1], 11: [1, 1, 1, 1], 12: [1, 10, 15, 20], 13: [10, 30, 35, 40] },
  prices: { [DUST]: auction(10) }
};

test("gets a rod once, the first time an enchant needs it, and lets a better rod cover the lesser ones", () => {
  setUp(ENCHANTING);
  globalThis.FOREVER_RECIPE_NAMES = { 12: "Enchant Bracer - Minor Health", 13: "Enchant Bracer - Minor Stamina" };
  const guide = buildGuide("Enchanting", 1, 30, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.deepEqual(guide.steps.map(function span(step) { return [step.recipeId, step.from, step.to, step.tools || []]; }), [[12, 1, 16, [373]], [13, 16, 30, [374]]]);
  assert.equal(guide.steps[0].itemId, null);
  assert.equal(guide.steps[0].toolCost, 10);
  assert.equal(guide.steps[1].toolCost, 30);
  assert.deepEqual(guide.lessons.map(function lessonOf(lesson) { return lesson.recipeId; }), [12, 10, 13, 11]);
});

test("doesn't get a rod the character already has a better one of", () => {
  setUp(ENCHANTING);
  const guide = buildGuide("Enchanting", 1, 10, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [374] });
  assert.equal(guide.steps[0].tools, undefined);
  assert.equal(guide.steps[0].toolCost, undefined);
});

test("plans the rod with the step's materials and names the enchant", () => {
  const character = setUp(ENCHANTING);
  globalThis.FOREVER_RECIPE_NAMES = { 12: "Enchant Bracer - Minor Health" };
  const guide = buildGuide("Enchanting", 1, 10, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  const stages = stageRows({ createdAt: 0, guide: guide, doneSteps: [], boughtMaterials: [] }, null, character);
  const step = stages[0].steps[0];
  assert.equal(step.craftFirst, "Craft first: 1× Runed Copper Rod");
  assert.equal(step.tools, "Needs: Runed Copper Rod");
  assert.equal(step.recipe.title, "Enchant Bracer - Minor Health");
  assert.equal(step.recipe.subtitle, "One enchant takes:");
  assert.deepEqual(stages[0].materials.map(function row(entry) { return [entry.itemId, entry.quantity]; }), [[DUST, "10×"]]);
});

test("compares only primary professions, since secondary ones give no legacy points", () => {
  const character = setUp(LINEN_FROM_70_TO_80);
  run("state.snapshots['test-hero'].professions = [{ name: 'Leatherworking', skillPoints: 50 }, { name: 'Skinning', skillPoints: 50 }]");
  compareProfessions();
  assert.deepEqual(comparisonRows(character).map(function nameOf(row) { return row.name; }), ["Leatherworking"]);
});

const SHIRTS_FROM_OWN_BOLTS = {
  recipes: [
    { id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[BOLT, 1]] },
    { id: 5, profession: "Tailoring", itemId: BOLT, quantity: 1, reagents: [[LINEN, 2]] }
  ],
  levels: { 1: [1, 100, 120, 140], 5: [1, 100, 120, 140] },
  prices: { [LINEN]: auction(10) }
};

function stepsOf(guide) {
  return guide.steps.map(function summary(step) { return [step.recipeId, step.from, step.to, step.crafts]; });
}

test("counts the skill from crafting a recipe's own components", () => {
  const character = setUp(SHIRTS_FROM_OWN_BOLTS);
  const guide = buildGuide("Tailoring", 1, 11, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.deepEqual(stepsOf(guide), [[1, 1, 11, 5]]);
  assert.equal(guide.total, 5 * 20);
  assert.deepEqual(guide.lessons.map(function lessonOf(lesson) { return lesson.recipeId; }), [1, 5]);
  const stages = stageRows({ createdAt: 0, guide: guide, doneSteps: [], boughtMaterials: [] }, null, character);
  assert.equal(stages[0].steps[0].craftFirst, "Craft first, for skill too: 5× Bolt of Linen Cloth");
  assert.deepEqual(stages[0].materials.map(function row(entry) { return [entry.itemId, entry.quantity]; }), [[LINEN, "10×"]]);
});

test("crafts a component it could buy cheaper when the extra skill makes up for it", () => {
  setUp(Object.assign({}, SHIRTS_FROM_OWN_BOLTS, { prices: { [LINEN]: auction(10), [BOLT]: auction(15) } }));
  const guide = buildGuide("Tailoring", 1, 11, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.deepEqual(stepsOf(guide), [[1, 1, 11, 5]]);
  assert.deepEqual(guide.steps[0].craftedForPoints, [BOLT]);
});

test("buys a component whose recipe is learned later than the recipe that needs it", () => {
  const character = setUp({
    recipes: SHIRTS_FROM_OWN_BOLTS.recipes,
    levels: { 1: [1, 100, 120, 140], 5: [50, 100, 120, 140] },
    prices: { [LINEN]: auction(10), [BOLT]: auction(100) }
  });
  const guide = buildGuide("Tailoring", 1, 5, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.deepEqual(stepsOf(guide), [[1, 1, 5, 4]]);
  assert.equal(guide.total, 400);
  assert.deepEqual(guide.lessons.map(function lessonOf(lesson) { return lesson.recipeId; }), [1]);
  const stages = stageRows({ createdAt: 0, guide: guide, doneSteps: [], boughtMaterials: [] }, null, character);
  assert.equal(stages[0].steps[0].craftFirst, "");
  assert.deepEqual(stages[0].materials.map(function row(entry) { return [entry.itemId, entry.quantity]; }), [[BOLT, "4×"]]);
});

test("uses what an earlier step made, and says on that step to keep it", () => {
  const character = setUp({
    recipes: [
      { id: 5, profession: "Tailoring", itemId: BOLT, quantity: 1, reagents: [[LINEN, 2]] },
      { id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[BOLT, 2], [WOOL, 1]] }
    ],
    levels: { 5: [1, 100, 120, 140], 1: [5, 100, 120, 140] },
    prices: { [LINEN]: auction(10), [WOOL]: auction(5) }
  });
  const guide = buildGuide("Tailoring", 1, 7, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.deepEqual(stepsOf(guide), [[5, 1, 5, 4], [1, 5, 7, 2]]);
  assert.equal(guide.total, 4 * 20 + 2 * 5);
  const stages = stageRows({ createdAt: 0, guide: guide, doneSteps: [], boughtMaterials: [] }, null, character);
  assert.equal(stages[0].steps[0].keep, "Keep 4 for Recipe 1 (5 → 7)");
  assert.equal(stages[0].steps[1].uses, "Uses 4× Bolt of Linen Cloth you made earlier");
  assert.equal(stages[0].hasTaking, false);
  assert.deepEqual(stages[0].materials.map(function row(entry) { return [entry.itemId, entry.quantity]; }), [[LINEN, "8×"], [WOOL, "2×"]]);
});

test("leaves out recipes with a cooldown", () => {
  setUp({
    recipes: [
      { id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[LINEN, 1]], cooldown: 3600 },
      { id: 2, profession: "Tailoring", itemId: 101, quantity: 1, reagents: [[WOOL, 1]] }
    ],
    levels: { 1: [1, 100, 120, 140], 2: [1, 100, 120, 140] },
    prices: { [LINEN]: auction(1), [WOOL]: auction(50) }
  });
  const guide = buildGuide("Tailoring", 1, 4, { knownRecipeIds: [], canCraft: ANYONE, ownedTools: [] });
  assert.deepEqual(stepsOf(guide), [[2, 1, 4, 3]]);
});
