import test from "node:test";
import assert from "node:assert/strict";
import { planner, resetPlanner } from "./helpers/realm.mjs";
import { characterPlan, isPicked, moveOldListsIntoPlans, planGroups, pruneGearPlan, removePick, togglePick } from "../web/src/ui/gear-plan.ts";

function sampleItem(overrides) {
  return Object.assign({
    id: 1, name: "Sample", quality: "UNCOMMON", slot: "HEAD", itemClass: "Armor", itemSubclass: "Leather",
    itemLevel: 40, requiredLevel: 40, usableLevel: 40, armor: 0, stats: { AGILITY: 10 }, effects: []
  }, overrides);
}

test("clicking a card picks it, clicking again unpicks it, and a slot can hold several picks", () => {
  const helm = sampleItem({ id: 1, name: "Helm A" });
  const otherHelm = sampleItem({ id: 2, name: "Helm B" });
  const { character, snapshot } = resetPlanner([helm, otherHelm]);
  togglePick("HEAD", helm);
  togglePick("HEAD", otherHelm);
  assert.equal(isPicked(character, "HEAD", helm), true);
  assert.equal(isPicked(character, "HEAD", otherHelm), true);
  assert.equal(planGroups(character, snapshot).flatMap(function entriesOf(group) { return group.entries; }).length, 2);
  togglePick("HEAD", helm);
  assert.equal(isPicked(character, "HEAD", helm), false);
  assert.equal(isPicked(character, "HEAD", otherHelm), true);
  removePick("HEAD", otherHelm);
  assert.deepEqual(Object.keys(characterPlan(character)), []);
});

test("a plan saved before plans were per spec moves to the spec you're gearing", () => {
  const helm = sampleItem({ id: 4, name: "Old Helm" });
  const { character } = resetPlanner([helm], { plan: { HEAD: { itemId: 4 } } });
  moveOldListsIntoPlans();
  assert.equal(character.plan, undefined);
  assert.deepEqual(characterPlan(character).HEAD, [{ itemId: 4 }]);
  assert.equal(isPicked(character, "HEAD", helm), true);
});

test("each spec has its own plan, cat and bear included", () => {
  const helm = sampleItem({ id: 5, name: "Cat Helm" });
  const robe = sampleItem({ id: 6, name: "Healer Robe", slot: "CHEST" });
  const { character, snapshot } = resetPlanner([helm, robe]);
  snapshot.talentSpecs = ["druid-feral-cat", "druid-restoration"];
  togglePick("HEAD", helm);
  character.gearFor = "off";
  assert.equal(isPicked(character, "HEAD", helm), false);
  togglePick("CHEST", robe);
  assert.equal(planGroups(character, snapshot).flatMap(function entriesOf(group) { return group.entries; }).length, 1);
  character.gearFor = "main";
  character.feralForm = "bear";
  assert.equal(isPicked(character, "HEAD", helm), false);
  assert.deepEqual(Object.keys(characterPlan(character)), []);
  character.feralForm = "cat";
  assert.equal(isPicked(character, "HEAD", helm), true);
  assert.equal(isPicked(character, "CHEST", robe), false);
  assert.deepEqual(Object.keys(character.plans).sort(), ["druid-feral-cat", "druid-restoration"]);
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

test("the plan is grouped by where: buy and craft first, then path zones in order with their dungeons, then elsewhere", () => {
  const items = [
    sampleItem({ id: 10, name: "Tanaris Helm", slot: "HEAD", sources: [{ type: "quest", questId: 100, quest: "Desert Quest", zone: "Tanaris" }] }),
    sampleItem({ id: 11, name: "Vale Boots", slot: "FEET", sources: [{ type: "drop", npcId: 5, npc: "Named Raptor", zone: "Stranglethorn Vale" }] }),
    sampleItem({ id: 12, name: "Far Belt", slot: "WAIST", sources: [{ type: "quest", questId: 101, quest: "Far Quest", zone: "Desolace" }] }),
    sampleItem({ id: 13, name: "Vendor Gloves", slot: "HAND", sources: [{ type: "vendor", npcId: 6, npc: "Trader", zone: "Tanaris", price: 5000 }] }),
    sampleItem({ id: 16, name: "City Cloak", slot: "CLOAK", sources: [{ type: "vendor", npcId: 7, npc: "Tailor", zone: "Orgrimmar", price: 800 }] }),
    sampleItem({ id: 17, name: "Auction Bracers", slot: "WRIST", sources: [] }),
    sampleItem({ id: 14, name: "Crafted Bracers", slot: "WRIST", sources: [{ type: "craft", profession: "Leatherworking", recipeId: 1, reagents: [] }] }),
    sampleItem({ id: 15, name: "Troll Ring", slot: "FINGER", itemSubclass: "Miscellaneous", sources: [{ type: "drop", npcId: 9, npc: "Troll Boss", zone: "Zul'Farrak" }] })
  ];
  const { character, snapshot, state } = resetPlanner(items, { route: { startLevel: 40, legs: [{ zone: "Stranglethorn Vale", toLevel: 44 }, { zone: "Tanaris", toLevel: 48 }] } });
  snapshot.level = 40;
  state.tsm = { prices: { 17: { marketValue: 30000, minBuyout: 30000, numAuctions: 4 } } };
  for (const [slotKey, item] of [["HEAD", items[0]], ["FEET", items[1]], ["WAIST", items[2]], ["HANDS", items[3]], ["WRIST", items[4]], ["FINGER_1", items[5]], ["BACK", items[6]], ["WRIST", items[7]]]) {
    togglePick(slotKey, item);
  }
  const groups = planGroups(character, snapshot);
  assert.deepEqual(groups.map(function titleOf(group) { return group.title; }), ["Buy on the auction house", "Craft", "Stranglethorn Vale (40–44)", "Tanaris (44–48)", "Zul'Farrak (dungeon in Tanaris)", "Desolace", "Orgrimmar"]);
  assert.equal(groups[0].entries[0].kind, "auction");
  assert.equal(groups[1].entries[0].kind, "craft");
  assert.equal(groups[2].entries[0].kind, "drop");
  assert.deepEqual(groups[3].entries.map(function kindOf(entry) { return entry.kind; }).sort(), ["quest", "vendor"]);
  assert.equal(groups[6].entries[0].price, 800);
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
  assert.deepEqual(Object.values(plan).flat().map(function idOf(pick) { return pick.itemId; }).sort(), [30, 31]);
  assert.equal(character.questList, undefined);
  moveOldListsIntoPlans();
  assert.equal(Object.keys(plan).length, 2);
  localStorage.clear();
  assert.equal(state.settings.characters.length, 1);
});
