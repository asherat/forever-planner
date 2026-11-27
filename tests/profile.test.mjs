import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/realm.mjs";
import { compactCompletedQuests, compactEquipment, compactProfessions, compactReputations } from "../web/src/profile.ts";
import { parseTooltipRequirements } from "../web/src/tooltip-checks.ts";

test("compacts equipped items, counting feral attack power from the item's spell", () => {
  const equipment = compactEquipment({
    equipped_items: [{
      item: { id: 1 }, name: "Feral Staff", quality: { type: "RARE" }, inventory_type: { type: "TWOHWEAPON" }, slot: { type: "MAIN_HAND" },
      item_subclass: { name: "Staff" }, weapon: { dps: { value: 30.5 } },
      stats: [{ type: { type: "STRENGTH" }, value: 10 }, { value: 3 }],
      spells: [{ description: "Equip: +120 Attack Power in Cat, Bear, and Dire Bear forms only." }, {}],
      enchantments: [{ display_string: "Enchanted: +3 Agility" }]
    }, {
      item: { id: 2 }, name: "Leather Cap", quality: { type: "COMMON" }, inventory_type: { type: "HEAD" }, slot: { type: "HEAD" },
      armor: { value: 55 }
    }]
  });
  assert.deepEqual(equipment.MAIN_HAND.stats, { STRENGTH: 10, FERAL_ATTACK_POWER: 120 });
  assert.equal(equipment.MAIN_HAND.weapon.damagePerSecond, 30.5);
  assert.equal(equipment.MAIN_HAND.itemSubclass, "Staff");
  assert.deepEqual(equipment.MAIN_HAND.effects, ["Equip: +120 Attack Power in Cat, Bear, and Dire Bear forms only."]);
  assert.deepEqual(equipment.MAIN_HAND.enchantments, ["Enchanted: +3 Agility"]);
  assert.equal(equipment.HEAD.armor, 55);
  assert.equal(equipment.HEAD.weapon, undefined);
  assert.deepEqual(compactEquipment(null), {});
});

test("keeps the highest profession tier's skill and every known recipe", () => {
  const professions = compactProfessions({
    primaries: [{ profession: { name: "Leatherworking" }, tiers: [{ skill_points: 150, known_recipes: [{ id: 1 }, { id: 2 }] }, { skill_points: 210, known_recipes: [{ id: 3 }] }] }],
    secondaries: [{ profession: { name: "Fishing" }, skill_points: 75 }]
  });
  assert.deepEqual(professions, [
    { name: "Leatherworking", skillPoints: 210, recipeIds: [1, 2, 3] },
    { name: "Fishing", skillPoints: 75, recipeIds: [] }
  ]);
  assert.deepEqual(compactProfessions(null), []);
});

test("compacts completed quests and reputation standings", () => {
  assert.deepEqual(compactCompletedQuests({ quests: [{ id: 5 }, { id: 9 }] }), [5, 9]);
  assert.deepEqual(compactCompletedQuests(null), []);
  assert.deepEqual(compactReputations({ reputations: [{ faction: { id: 889 }, standing: { tier: 3 } }] }), { 889: 3 });
});

test("reads reputation requirements from a Wowhead tooltip", () => {
  globalThis.FOREVER_REPUTATIONS = { "Warsong Outriders": { id: 889, side: "HORDE" } };
  const html = "<table><tr><td>Rune of Duty<br>Requires&nbsp;Warsong Outriders - Friendly<br>Requires Nobody Known - Exalted</td></tr></table>";
  assert.deepEqual(parseTooltipRequirements(html), [{ factionId: 889, side: "HORDE", tier: 4, text: "Requires Warsong Outriders - Friendly" }]);
  assert.deepEqual(parseTooltipRequirements("<b>No requirements</b>"), []);
});
