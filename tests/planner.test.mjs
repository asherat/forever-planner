import test from "node:test";
import assert from "node:assert/strict";
import { planner, resetPlanner } from "./helpers/realm.mjs";

function sampleItem(overrides) {
  return Object.assign({
    id: 1, name: "Sample", quality: "UNCOMMON", slot: "HEAD", itemClass: "Armor", itemSubclass: "Leather",
    itemLevel: 40, requiredLevel: 40, usableLevel: 40, armor: 0, stats: {}, effects: []
  }, overrides);
}

function loadPlanner(items, characterOverrides) {
  return Object.assign({ context: planner }, resetPlanner(items, characterOverrides));
}

function tsmPrice(regionMarketValue, minBuyout, numAuctions) {
  return { regionMarketValue: regionMarketValue, marketValue: regionMarketValue, minBuyout: minBuyout, numAuctions: numAuctions };
}

test("weapon damage counts for the slot the weapon goes in", () => {
  const { context } = loadPlanner();
  const weights = { MAIN_HAND_DPS: 10, OFF_HAND_DPS: 2, RANGED_DPS: 5 };
  const sword = sampleItem({ slot: "WEAPON", weapon: { damagePerSecond: 10 } });
  const bow = sampleItem({ slot: "RANGED", weapon: { damagePerSecond: 10 } });
  assert.equal(context.itemScore(sword, weights, "MAIN_HAND"), 100);
  assert.equal(context.itemScore(sword, weights, "OFF_HAND"), 20);
  assert.equal(context.itemScore(bow, weights, "RANGED"), 50);
});

test("a random-suffix item is scored as its best suffix", () => {
  const { context } = loadPlanner();
  const helmet = sampleItem({
    randomSuffixes: [
      { bonusId: 1, name: "of the Owl", stats: { INTELLECT: 13, SPIRIT: 13 } },
      { bonusId: 2, name: "of the Tiger", stats: { AGILITY: 13, STRENGTH: 13 } }
    ]
  });
  const best = context.bestSuffixVariant(helmet, { AGILITY: 2, STRENGTH: 2 }, "HEAD");
  assert.equal(best.name, "Sample of the Tiger");
  assert.equal(best.suffix.bonusId, 2);
});

test("questing halves hit, and a PvP realm keeps stamina worth something", () => {
  const { context, character, snapshot } = loadPlanner(null, { playstyle: "questing" });
  const cat = context.GAME_RULES.specPresets["feral-cat"].weights;
  assert.equal(context.characterWeights(character).HIT_RATING, cat.HIT_RATING * 0.5);
  snapshot.ruleset = "PvP";
  const stamina = context.characterWeights(character).STAMINA;
  assert.ok(Math.abs(stamina - cat.AGILITY * 0.6) < 0.001);
});

test("druids can't use plate, and anyone can wear rings", () => {
  const { context, snapshot } = loadPlanner();
  assert.equal(context.canUseItem(sampleItem({ itemSubclass: "Plate" }), snapshot), false);
  assert.equal(context.canUseItem(sampleItem({ itemSubclass: "Leather" }), snapshot), true);
  assert.equal(context.canUseItem(sampleItem({ slot: "FINGER", itemSubclass: "Miscellaneous" }), snapshot), true);
});

test("the gold limit ignores AH prices when nothing is listed", () => {
  const vendorItem = sampleItem({ id: 7, vendorPrice: 500000 });
  const { context, snapshot, state } = loadPlanner([vendorItem], { maxGoldPerUpgrade: 20 });
  state.tsm = { prices: { 7: tsmPrice(150000, 0, 0) } };
  state.questie = { items: { 7: { sources: [{ type: "vendor", npc: "Trader", friendlyTo: "AH" }], quests: [], vendorFaction: null } } };
  assert.equal(context.cheapestCost(vendorItem, snapshot), 500000);
  assert.equal(context.isWithinGoldLimit(context.cheapestCost(vendorItem, snapshot)), false);
});

test("a vendor item without a known price is not a quick option under a gold limit", () => {
  const { context, snapshot } = loadPlanner([], { maxGoldPerUpgrade: 20 });
  assert.equal(context.isEasySource({ type: "vendor" }, snapshot), false);
  context.selectedCharacter().maxGoldPerUpgrade = null;
  assert.equal(context.isEasySource({ type: "vendor" }, snapshot), true);
});

test("random-suffix items are never bought on the AH", () => {
  const maul = sampleItem({ id: 9 });
  const { context, snapshot, state } = loadPlanner([maul]);
  state.tsm = { prices: { 9: tsmPrice(26700, 26000, 4) } };
  const tiger = context.itemWithSuffix(maul, { bonusId: 1, name: "of the Tiger", stats: {} });
  assert.equal(context.isBuyableOnAuctionHouse(maul), true);
  assert.equal(context.isBuyableOnAuctionHouse(tiger), false);
  assert.equal(context.cheapestCost(tiger, snapshot), null);
});

test("trash drops and containers don't count, boss drops do", () => {
  const trash = sampleItem({ id: 20 });
  const boss = sampleItem({ id: 21 });
  const chest = sampleItem({ id: 22 });
  const { context, snapshot, state } = loadPlanner([trash, boss, chest]);
  const trashDrops = [1, 2, 3].map(function trashMob(id) { return { type: "drop", npcId: id, npc: "Brute", zone: "Tanaris" }; });
  trashDrops.push({ type: "more-drops", count: 5 });
  state.questie = { items: {
    20: { sources: trashDrops, quests: [], vendorFaction: null },
    21: { sources: [{ type: "drop", npcId: 9, npc: "Boss", zone: "Zul'Farrak" }], quests: [], vendorFaction: null },
    22: { sources: [{ type: "object", name: "Solid Chest", zone: "Tanaris" }], quests: [], vendorFaction: null }
  } };
  assert.equal(context.hasKnownSource(trash, snapshot), false);
  assert.equal(context.hasKnownSource(boss, snapshot), true);
  assert.equal(context.hasKnownSource(chest, snapshot), false);
});

test("a skipped dungeon's drops stop counting", () => {
  const item = sampleItem({ id: 30 });
  const { context, snapshot, character, state } = loadPlanner([item]);
  state.questie = { items: { 30: { sources: [{ type: "drop", npcId: 9, npc: "Boss", zone: "Zul'Farrak" }], quests: [], vendorFaction: null } } };
  assert.equal(context.hasKnownSource(item, snapshot), true);
  character.skippedDungeons = ["Zul'Farrak"];
  assert.equal(context.hasKnownSource(item, snapshot), false);
  assert.ok(context.itemDungeons(item, snapshot).has("Zul'Farrak"));
});

test("on a route, a quest reward counts from the quest's level", () => {
  const item = sampleItem({ id: 40, usableLevel: 40, sources: [{ type: "quest", questId: 500, quest: "Late Quest", zone: "Tanaris", level: 48 }] });
  const { context, character, snapshot } = loadPlanner([item]);
  character.route = { startLevel: 43, legs: [{ zone: "Tanaris", toLevel: 50 }] };
  const availability = context.routeAvailability(item, snapshot, character);
  assert.equal(availability.level, 48);
  assert.equal(availability.leg.zone, "Tanaris");
});

test("a zone visited twice counts on its later visit too", () => {
  const item = sampleItem({ id: 41, usableLevel: 50, sources: [{ type: "quest", questId: 501, quest: "Return", zone: "Tanaris" }] });
  const { context, character, snapshot } = loadPlanner([item]);
  character.route = { startLevel: 43, legs: [{ zone: "Tanaris", toLevel: 45 }, { zone: "Feralas", toLevel: 48 }, { zone: "Tanaris", toLevel: 52 }] };
  const availability = context.routeAvailability(item, snapshot, character);
  assert.notEqual(availability, null);
  assert.equal(availability.leg.fromLevel, 48);
});

test("a vendor's faction doesn't hide an item that also drops", () => {
  const item = sampleItem({ id: 50 });
  const { context, state } = loadPlanner([item]);
  state.questie = { items: { 50: { sources: [{ type: "vendor", npc: "Quartermaster", friendlyTo: "A" }, { type: "drop", npcId: 9, npc: "Boss", zone: "Zul'Farrak" }], quests: [], vendorFaction: "ALLIANCE" } } };
  assert.equal(context.itemFaction(item), null);
  state.questie.items[50].sources.pop();
  assert.equal(context.itemFaction(item), "ALLIANCE");
});

test("imported settings get a sane lookahead and gold limit", () => {
  const { context } = loadPlanner();
  const settings = context.validatedSettings({
    lookaheadLevels: "99",
    characters: [{ slug: "a", displayName: "A", maxGoldPerUpgrade: "lots" }]
  });
  assert.equal(settings.lookaheadLevels, 10);
  assert.equal(settings.characters[0].maxGoldPerUpgrade, null);
  assert.deepEqual(Array.from(settings.characters[0].skippedDungeons), []);
  assert.equal(context.clampedLookahead("-3"), 3);
});

test("the quicker option prefers an easy source you can use now", () => {
  const { context, snapshot } = loadPlanner();
  const dropBest = { item: sampleItem({ id: 60, name: "Boss Helm" }), availableLevel: 43, routeLeg: null, gain: 30 };
  const questHelm = { item: sampleItem({ id: 61, name: "Quest Helm", sources: [{ type: "quest", questId: 700, quest: "Helm Quest", zone: "Tanaris" }] }), availableLevel: 43, routeLeg: null, gain: 10 };
  assert.equal(context.quickerOption(dropBest, [dropBest, questHelm], snapshot).item.name, "Quest Helm");
  assert.equal(context.quickerOption(questHelm, [questHelm, dropBest], snapshot), null);
});

test("one quest reward can't fill both ring slots", () => {
  const bigRing = sampleItem({ id: 70, name: "Big Ring", slot: "FINGER", itemSubclass: "Miscellaneous", stats: { AGILITY: 10 }, sources: [{ type: "quest", questId: 900, quest: "Ring Quest", zone: "Tanaris" }] });
  const smallRing = sampleItem({ id: 71, name: "Small Ring", slot: "FINGER", itemSubclass: "Miscellaneous", stats: { AGILITY: 5 }, sources: [{ type: "quest", questId: 901, quest: "Other Quest", zone: "Tanaris" }] });
  const { context, snapshot } = loadPlanner([bigRing, smallRing]);
  const group = context.pairedUpgradeOptions(context.slotDefinitionByKey("FINGER_1"), snapshot, context.selectedCharacter());
  const bests = group.parts.map(function bestName(part) { return part.best.item.name; });
  assert.deepEqual(bests, ["Big Ring", "Small Ring"]);
});

test("an item you can only buy says so instead of listing chance drops and chests", async () => {
  const { auctionOnlyText } = await import("../web/src/ui/upgrade-card.ts");
  const ring = sampleItem({ id: 7552, name: "Falcon's Hook", slot: "FINGER" });
  const { snapshot, state } = loadPlanner([ring]);
  state.questie = { items: { 7552: { sources: [{ type: "world-drop", count: 144 }, { type: "object", name: "Solid Chest", zone: "Stranglethorn Vale" }], quests: [] } } };
  assert.equal(auctionOnlyText(ring, snapshot), "");
  state.tsm = { prices: { 7552: tsmPrice(5581, 9000, 18) } };
  planner.resetSourceCaches();
  assert.equal(auctionOnlyText(ring, snapshot), "Buy it on the auction house (18 listed)");
  state.questie.items[7552].sources.push({ type: "quest", questId: 900, quest: "Ring Quest", zone: "Stranglethorn Vale" });
  planner.resetSourceCaches();
  assert.equal(auctionOnlyText(ring, snapshot), "");
});

test("feral only gets leather armor; resto may still use cloth, and cloaks are fine for both", () => {
  const source = [{ type: "quest", questId: 950, quest: "Mask Quest", zone: "Tanaris" }];
  const clothMask = sampleItem({ id: 80, name: "White Bandit Mask", slot: "HEAD", itemSubclass: "Cloth", stats: { AGILITY: 11, STRENGTH: 11, INTELLECT: 9 }, sources: source });
  const leatherCap = sampleItem({ id: 81, name: "Leather Cap", slot: "HEAD", itemSubclass: "Leather", stats: { AGILITY: 4, INTELLECT: 2 }, sources: [{ type: "quest", questId: 951, quest: "Cap Quest", zone: "Tanaris" }] });
  const clothCloak = sampleItem({ id: 82, name: "Agile Cloak", slot: "CLOAK", itemSubclass: "Cloth", stats: { AGILITY: 5 }, sources: [{ type: "quest", questId: 952, quest: "Cloak Quest", zone: "Tanaris" }] });
  const { context, character, snapshot } = loadPlanner([clothMask, leatherCap, clothCloak]);
  snapshot.talentSpecs = ["druid-feral-cat", "druid-restoration"];
  const head = context.slotDefinitionByKey("HEAD");
  const back = context.slotDefinitionByKey("BACK");
  const names = function candidateNames(slot) {
    return context.rankedCandidatesForSlot(slot, snapshot, character).map(function nameOf(candidate) { return candidate.item.name; });
  };
  assert.deepEqual(names(head), ["Leather Cap"]);
  assert.deepEqual(names(back), ["Agile Cloak"]);
  character.gearFor = "off";
  context.resetSourceCaches();
  assert.equal(names(head)[0], "White Bandit Mask");
  character.gearFor = "main";
  assert.equal(context.isUpgradeForAnySpec(clothMask, character, snapshot), true);
});

test("hunters wear mail only from level 40, and then only mail for armor slots", () => {
  const quest = function questSource(questId) { return [{ type: "quest", questId: questId, quest: "Quest " + questId, zone: "Stranglethorn Vale" }]; };
  const mailHelm = sampleItem({ id: 90, name: "Mail Helm", slot: "HEAD", itemSubclass: "Mail", requiredLevel: 35, usableLevel: 35, stats: { AGILITY: 12 }, sources: quest(960) });
  const leatherHelm = sampleItem({ id: 91, name: "Leather Helm", slot: "HEAD", itemSubclass: "Leather", requiredLevel: 36, usableLevel: 36, stats: { AGILITY: 8 }, sources: quest(961) });
  const { context, character, snapshot } = loadPlanner([mailHelm, leatherHelm]);
  snapshot.className = "Hunter";
  snapshot.talentSpecs = ["hunter-marksmanship"];
  snapshot.level = 38;
  assert.equal(context.itemUsableLevel(mailHelm, snapshot), 40);
  assert.equal(context.itemUsableLevel(leatherHelm, snapshot), 36);
  assert.equal(context.isLevelEstimated(mailHelm, snapshot), false);
  const head = context.slotDefinitionByKey("HEAD");
  const ranked = function rankedNames() {
    context.resetSourceCaches();
    return context.rankedCandidatesForSlot(head, snapshot, character).map(function describe(candidate) { return candidate.item.name + "@" + candidate.availableLevel; });
  };
  assert.deepEqual(ranked(), ["Mail Helm@40", "Leather Helm@36"]);
  snapshot.level = 41;
  assert.deepEqual(ranked(), ["Mail Helm@40"]);
});

test("casters and healers keep lighter armor types; warriors get plate from 40", () => {
  const intellectLeather = sampleItem({ id: 92, name: "Intellect Leather", slot: "CHEST", itemSubclass: "Leather", stats: { INTELLECT: 15, SPIRIT: 8 }, sources: [{ type: "quest", questId: 970, quest: "Robe Quest", zone: "Tanaris" }] });
  const { context, character, snapshot } = loadPlanner([intellectLeather]);
  snapshot.className = "Shaman";
  snapshot.talentSpecs = ["shaman-restoration"];
  snapshot.level = 45;
  assert.equal(context.suitsSpec(intellectLeather, "shaman-restoration", snapshot), true);
  assert.equal(context.suitsSpec(intellectLeather, "shaman-enhancement", snapshot), false);
  snapshot.className = "Warrior";
  const plate = sampleItem({ id: 93, slot: "CHEST", itemSubclass: "Plate", requiredLevel: 40, usableLevel: 40 });
  const mail = sampleItem({ id: 94, slot: "CHEST", itemSubclass: "Mail", requiredLevel: 30, usableLevel: 30 });
  snapshot.level = 38;
  assert.equal(context.bestArmorType("Warrior", 38), "Mail");
  assert.equal(context.suitsSpec(mail, "warrior-arms", snapshot), true);
  assert.equal(context.suitsSpec(plate, "warrior-arms", snapshot), true);
  snapshot.level = 40;
  assert.equal(context.suitsSpec(mail, "warrior-arms", snapshot), false);
  assert.equal(context.bestArmorType("Rogue", 60), "Leather");
});
