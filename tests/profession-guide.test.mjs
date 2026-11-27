import test from "node:test";
import assert from "node:assert/strict";
import { resetPlanner } from "./helpers/realm.mjs";
import { crafting, defaultCraftingList, indexRecipes } from "../web/src/crafting-plan.ts";
import { buildGuide, recipeColor, skillRankAt, skillUpChance } from "../web/src/profession-guide.ts";
import { costStillToBuy, shoppingRows, stageRows, startGuidePage } from "../web/src/ui/profession-page.ts";

const LINEN = 2589;
const WOOL = 2592;
const PATTERN = 9000;

function setUp(options) {
  const { character, snapshot, state } = resetPlanner();
  snapshot.faction = "Horde";
  globalThis.FOREVER_CRAFTING_ITEMS = {
    [LINEN]: { name: "Linen Cloth", quality: "COMMON", icon: 1, vendorPrice: 0 },
    [WOOL]: { name: "Wool Cloth", quality: "COMMON", icon: 2, vendorPrice: 0 },
    [PATTERN]: { name: "Pattern: Fancy Wool", quality: "UNCOMMON", icon: 3, vendorPrice: 0 }
  };
  globalThis.FOREVER_RECIPES = options.recipes;
  globalThis.FOREVER_RECIPE_LEVELS = options.levels;
  globalThis.FOREVER_RECIPE_NAMES = {};
  indexRecipes();
  state.questie = { items: {} };
  state.tsm = { prices: options.prices };
  state.inventory = null;
  crafting.list = defaultCraftingList();
  return character;
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
  const guide = buildGuide("Tailoring", 1, 20, []);
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
  const guide = buildGuide("Tailoring", 1, 30, []);
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
  const guide = buildGuide("Tailoring", 1, 40, []);
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
  const guide = buildGuide("Tailoring", 10, 20, [2]);
  assert.equal(guide.lessons.length, 0);
  assert.equal(guide.steps[0].crafts, 10);
});

test("stops where no recipe gives skill", () => {
  setUp({
    recipes: [{ id: 1, profession: "Tailoring", itemId: 100, quantity: 1, reagents: [[LINEN, 1]] }],
    levels: { 1: [1, 10, 15, 20] },
    prices: { [LINEN]: auction(10) }
  });
  const guide = buildGuide("Tailoring", 1, 40, []);
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
  const guide = buildGuide("Tailoring", 70, 80, []);
  assert.deepEqual(guide.steps.map(function span(step) { return [step.recipeId, step.from, step.to, step.crafts]; }), [[1, 70, 75, 5], [1, 75, 80, 5]]);
  assert.equal(skillRankAt(74).name, "Apprentice");
  assert.equal(skillRankAt(75).name, "Journeyman");
  assert.equal(skillRankAt(300).name, "Artisan");
});

test("splits a plan into rank stages, each with its own shopping list and a running total", () => {
  setUp(LINEN_FROM_70_TO_80);
  const guide = buildGuide("Tailoring", 70, 80, []);
  const saved = { createdAt: 0, guide: guide, doneSteps: [], boughtMaterials: ["Apprentice:" + LINEN] };
  const stages = stageRows(saved, null);
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
  const guide = buildGuide("Tailoring", 70, 80, []);
  character.professionGuides = { Tailoring: { createdAt: 0, guide: guide, doneSteps: [], boughtItemIds: [LINEN, WOOL] } };
  startGuidePage();
  assert.deepEqual(character.professionGuides.Tailoring.boughtMaterials, ["Apprentice:" + LINEN, "Journeyman:" + LINEN]);
  assert.equal(character.professionGuides.Tailoring.boughtItemIds, undefined);
});
