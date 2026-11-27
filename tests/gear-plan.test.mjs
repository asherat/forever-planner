import test from "node:test";
import assert from "node:assert/strict";
import { planner, resetPlanner } from "./helpers/realm.mjs";
import { characterPlan, isPicked, moveOldListsIntoPlans, planGroups, pruneGearPlan, togglePick } from "../web/src/ui/gear-plan.ts";

function sampleItem(overrides) {
  return Object.assign({
    id: 1, name: "Sample", quality: "UNCOMMON", slot: "HEAD", itemClass: "Armor", itemSubclass: "Leather",
    itemLevel: 40, requiredLevel: 40, usableLevel: 40, armor: 0, stats: { AGILITY: 10 }, effects: []
  }, overrides);
}

test("clicking a card picks it, clicking again unpicks it, and one pick per slot", () => {
  const helm = sampleItem({ id: 1, name: "Helm A" });
  const otherHelm = sampleItem({ id: 2, name: "Helm B" });
  const { character } = resetPlanner([helm, otherHelm]);
  togglePick("HEAD", helm);
  assert.equal(isPicked(character, "HEAD", helm), true);
  togglePick("HEAD", otherHelm);
  assert.equal(isPicked(character, "HEAD", helm), false);
  assert.equal(isPicked(character, "HEAD", otherHelm), true);
  togglePick("HEAD", otherHelm);
  assert.deepEqual(Object.keys(characterPlan(character)), []);
});

test("a random-suffix pick remembers its suffix", () => {
  const cloak = sampleItem({ id: 3, name: "Wild Cloak", slot: "CLOAK", randomSuffixes: [{ name: "of the Tiger", bonusId: 1, stats: { AGILITY: 3 } }] });
  const { character, snapshot } = resetPlanner([cloak]);
  const tiger = planner.itemWithSuffix(cloak, cloak.randomSuffixes[0]);
  togglePick("BACK", tiger);
  assert.equal(isPicked(character, "BACK", tiger), true);
  assert.equal(isPicked(character, "BACK", cloak), false);
  assert.equal(planGroups(character, snapshot)[0].entries[0].item.name, "Wild Cloak of the Tiger");
});

test("the plan is grouped by where: path zones in order, then elsewhere, buy and craft", () => {
  const items = [
    sampleItem({ id: 10, name: "Tanaris Helm", slot: "HEAD", sources: [{ type: "quest", questId: 100, quest: "Desert Quest", zone: "Tanaris" }] }),
    sampleItem({ id: 11, name: "Vale Boots", slot: "FEET", sources: [{ type: "drop", npcId: 5, npc: "Named Raptor", zone: "Stranglethorn Vale" }] }),
    sampleItem({ id: 12, name: "Far Belt", slot: "WAIST", sources: [{ type: "quest", questId: 101, quest: "Far Quest", zone: "Desolace" }] }),
    sampleItem({ id: 13, name: "Vendor Gloves", slot: "HAND", sources: [{ type: "vendor", npcId: 6, npc: "Trader", zone: "Orgrimmar", price: 5000 }] }),
    sampleItem({ id: 14, name: "Crafted Bracers", slot: "WRIST", sources: [{ type: "craft", profession: "Leatherworking", recipeId: 1, reagents: [] }] })
  ];
  const { character, snapshot } = resetPlanner(items, { route: { startLevel: 40, legs: [{ zone: "Stranglethorn Vale", toLevel: 44 }, { zone: "Tanaris", toLevel: 48 }] } });
  snapshot.level = 40;
  for (const [slotKey, item] of [["HEAD", items[0]], ["FEET", items[1]], ["WAIST", items[2]], ["HANDS", items[3]], ["WRIST", items[4]]]) {
    togglePick(slotKey, item);
  }
  const groups = planGroups(character, snapshot);
  assert.deepEqual(groups.map(function titleOf(group) { return group.title; }), ["Stranglethorn Vale (40–44)", "Tanaris (44–48)", "Desolace", "Buy", "Craft"]);
  assert.equal(groups[0].entries[0].kind, "drop");
  assert.equal(groups[1].entries[0].kind, "quest");
  assert.equal(groups[3].entries[0].kind, "vendor");
  assert.equal(groups[3].entries[0].price, 5000);
  assert.equal(groups[4].entries[0].kind, "craft");
});

test("Refresh drops picks you equipped or outgrew", () => {
  const helm = sampleItem({ id: 20, name: "Picked Helm", slot: "HEAD", stats: { AGILITY: 10 } });
  const boots = sampleItem({ id: 21, name: "Picked Boots", slot: "FEET", stats: { AGILITY: 5 } });
  const ring = sampleItem({ id: 22, name: "Picked Ring", slot: "FINGER", itemSubclass: "Miscellaneous", stats: { AGILITY: 8 } });
  const { character, snapshot } = resetPlanner([helm, boots, ring]);
  togglePick("HEAD", helm);
  togglePick("FEET", boots);
  togglePick("FINGER_1", ring);
  snapshot.equipment.HEAD = helm;
  snapshot.equipment.FEET = sampleItem({ id: 23, name: "Better Boots", slot: "FEET", stats: { AGILITY: 20 } });
  assert.deepEqual(pruneGearPlan(character, snapshot).sort(), ["Picked Boots", "Picked Helm"]);
  assert.equal(Object.keys(characterPlan(character)).length, 1);
});

test("the old quest list and crafting list become picks once", () => {
  const helm = sampleItem({ id: 30, name: "Quest Helm", slot: "HEAD" });
  const gloves = sampleItem({ id: 31, name: "Crafted Gloves", slot: "HAND" });
  const { character, state } = resetPlanner([helm, gloves], { questList: [{ questId: 300, itemId: 30 }] });
  delete character.plan;
  localStorage.setItem("foreverPlanner.craftingCart", JSON.stringify([{ itemId: 31, quantity: 1 }]));
  moveOldListsIntoPlans();
  const plan = characterPlan(character);
  assert.deepEqual(Object.values(plan).map(function idOf(pick) { return pick.itemId; }).sort(), [30, 31]);
  assert.equal(character.questList, undefined);
  moveOldListsIntoPlans();
  assert.equal(Object.keys(plan).length, 2);
  localStorage.clear();
  assert.equal(state.settings.characters.length, 1);
});
