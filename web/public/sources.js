const completedQuestCache = { snapshot: null, questIds: new Set() };
const sourceCache = { snapshot: null, questie: null, entries: new Map() };
const CLASS_BITS = { Warrior: 1, Paladin: 2, Hunter: 4, Rogue: 8, Priest: 16, Shaman: 64, Mage: 128, Warlock: 256, Druid: 1024 };
const NEUTRAL_REPUTATION_TIER = 3;
const REPUTATION_TIERS_WITHIN_REACH = 1;
const itemIndex = new Map();
const REPUTATION_TIER_NAMES = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"];
const COPPER_PER_GOLD = 10000;
const FARMABLE_DROP_CREATURE_LIMIT = 3;

function completedQuests(snapshot) {
  if (completedQuestCache.snapshot !== snapshot) {
    completedQuestCache.snapshot = snapshot;
    completedQuestCache.questIds = new Set(snapshot.completedQuestIds || []);
  }
  return completedQuestCache.questIds;
}

function reputationTier(snapshot, factionId) {
  if (snapshot.reputations && snapshot.reputations[factionId] !== undefined) {
    return snapshot.reputations[factionId];
  }
  return NEUTRAL_REPUTATION_TIER;
}

function itemReputationRequirement(item, snapshot) {
  if (item.reputationRequirement) {
    return { factionId: item.reputationRequirement.factionId, tier: item.reputationRequirement.tier, text: item.reputation };
  }
  const looked = state.tooltipRequirements[item.id];
  if (!looked || !looked.reputations) {
    return null;
  }
  for (const requirement of looked.reputations) {
    if (requirement.side === null || requirement.side === snapshot.factionType) {
      return requirement;
    }
  }
  return null;
}

function meetsReputation(item, snapshot) {
  const requirement = itemReputationRequirement(item, snapshot);
  if (requirement === null) {
    return true;
  }
  return reputationTier(snapshot, requirement.factionId) >= requirement.tier;
}

function isReputationWithinReach(item, snapshot) {
  const requirement = itemReputationRequirement(item, snapshot);
  if (requirement === null) {
    return true;
  }
  return reputationTier(snapshot, requirement.factionId) >= requirement.tier - REPUTATION_TIERS_WITHIN_REACH;
}

function reputationRequirementText(item, snapshot) {
  const requirement = itemReputationRequirement(item, snapshot);
  const current = REPUTATION_TIER_NAMES[reputationTier(snapshot, requirement.factionId)];
  if (meetsReputation(item, snapshot)) {
    return requirement.text + " (you have it)";
  }
  return requirement.text + " (you're " + current + ")";
}

function itemDungeons(item, snapshot) {
  const names = new Set();
  for (const source of gettableSources(item, snapshot)) {
    if (source.type !== "drop" && source.type !== "quest") {
      continue;
    }
    const dungeon = dungeonForArea(source.zone);
    if (dungeon !== null) {
      names.add(dungeon.name);
    }
  }
  return names;
}

function hasProfession(snapshot, professionName) {
  for (const profession of snapshot.professions) {
    if (profession.name === professionName) {
      return true;
    }
  }
  return false;
}

function questieDetail(item) {
  if (state.questie === null) {
    return null;
  }
  return state.questie.items[item.id] || null;
}

function factionLetter(factionType) {
  if (factionType === "ALLIANCE") {
    return "A";
  }
  return "H";
}

function questieQuestsForCharacter(detail, snapshot) {
  const quests = [];
  const classBit = CLASS_BITS[snapshot.className];
  for (const quest of detail.quests) {
    if (completedQuests(snapshot).has(quest.id)) {
      continue;
    }
    const factionMatches = quest.faction === null || quest.faction === snapshot.factionType;
    const classMatches = !quest.classes || !classBit || Boolean(quest.classes & classBit);
    if (factionMatches && classMatches) {
      quests.push(quest);
    }
  }
  return quests;
}

function itemFaction(item) {
  if (item.faction) {
    return item.faction;
  }
  const detail = questieDetail(item);
  if (detail === null || detail.vendorFaction === null) {
    return null;
  }
  for (const source of item.sources || []) {
    if (source.type === "craft" || source.type === "quest") {
      return null;
    }
  }
  if (detail.quests.length > 0) {
    return null;
  }
  for (const source of detail.sources) {
    if (source.type !== "vendor") {
      return null;
    }
  }
  return detail.vendorFaction;
}

function itemUsableLevel(item, snapshot) {
  if (!item.levelEstimated) {
    return item.usableLevel;
  }
  const detail = questieDetail(item);
  if (detail === null) {
    return item.usableLevel;
  }
  let lowestQuestLevel = 0;
  for (const quest of questieQuestsForCharacter(detail, snapshot)) {
    if (quest.questLevel > 0 && (lowestQuestLevel === 0 || quest.questLevel < lowestQuestLevel)) {
      lowestQuestLevel = quest.questLevel;
    }
  }
  if (lowestQuestLevel > 0) {
    return lowestQuestLevel;
  }
  return item.usableLevel;
}

function isLevelEstimated(item, snapshot) {
  return item.levelEstimated && itemUsableLevel(item, snapshot) === item.usableLevel;
}

function questieQuest(questId) {
  if (state.questie === null || !state.questie.quests) {
    return null;
  }
  return state.questie.quests[questId] || null;
}

function isQuestForCharacter(questId, snapshot) {
  if (completedQuests(snapshot).has(questId)) {
    return false;
  }
  const quest = questieQuest(questId);
  if (quest === null) {
    return true;
  }
  if (quest.faction !== null && quest.faction !== snapshot.factionType) {
    return false;
  }
  const classBit = CLASS_BITS[snapshot.className];
  if (quest.classes && classBit && !(quest.classes & classBit)) {
    return false;
  }
  return true;
}

function clearSourceCache() {
  sourceCache.entries.clear();
}

function sourcesForCharacter(item, snapshot) {
  if (sourceCache.snapshot !== snapshot || sourceCache.questie !== state.questie) {
    sourceCache.snapshot = snapshot;
    sourceCache.questie = state.questie;
    sourceCache.entries.clear();
  }
  if (!sourceCache.entries.has(item.id)) {
    sourceCache.entries.set(item.id, collectSourcesForCharacter(item, snapshot));
  }
  return sourceCache.entries.get(item.id);
}

function collectSourcesForCharacter(item, snapshot) {
  const sources = [];
  const detail = questieDetail(item);
  const questLevels = {};
  const otherFactionQuestIds = new Set();
  const listedQuestIds = new Set();
  if (detail !== null) {
    for (const quest of questieQuestsForCharacter(detail, snapshot)) {
      questLevels[quest.id] = quest;
    }
    for (const quest of detail.quests) {
      if (quest.faction !== null && quest.faction !== snapshot.factionType) {
        otherFactionQuestIds.add(quest.id);
      }
    }
  }
  for (const source of item.sources || []) {
    if (source.faction && source.faction !== snapshot.factionType) {
      continue;
    }
    if (source.type === "quest" && otherFactionQuestIds.has(source.questId)) {
      continue;
    }
    if (source.type === "quest" && !isQuestForCharacter(source.questId, snapshot)) {
      continue;
    }
    if (source.type === "quest" && !source.level && !questLevels[source.questId] && questieQuest(source.questId) !== null) {
      listedQuestIds.add(source.questId);
      sources.push(Object.assign({}, source, { level: questieQuest(source.questId).questLevel }));
      continue;
    }
    if (source.type === "quest") {
      listedQuestIds.add(source.questId);
      if (questLevels[source.questId]) {
        sources.push(Object.assign({}, source, { level: questLevels[source.questId].questLevel }));
        continue;
      }
    }
    sources.push(source);
  }
  if (detail === null) {
    return sources;
  }
  for (const questId of Object.keys(questLevels)) {
    const quest = questLevels[questId];
    if (!listedQuestIds.has(quest.id)) {
      sources.push({ type: "quest", questId: quest.id, quest: quest.name, zone: quest.zone, level: quest.questLevel });
    }
  }
  const ownLetter = factionLetter(snapshot.factionType);
  const dropCreatures = dropCreatureCount(detail.sources);
  if (dropCreatures > FARMABLE_DROP_CREATURE_LIMIT) {
    sources.push({ type: "world-drop", count: dropCreatures });
  }
  for (const source of detail.sources) {
    if (dropCreatures > FARMABLE_DROP_CREATURE_LIMIT && isDropSource(source)) {
      continue;
    }
    if (source.type === "vendor" && source.friendlyTo && source.friendlyTo.indexOf(ownLetter) === -1) {
      continue;
    }
    if (source.type === "vendor" && item.vendorPrice) {
      sources.push(Object.assign({}, source, { price: item.vendorPrice * (1 - vendorDiscountRate()) }));
      continue;
    }
    sources.push(source);
  }
  return sources;
}

function isDropSource(source) {
  return source.type === "drop" || source.type === "more-drops" || source.type === "world-drop";
}

function dropCreatureCount(sources) {
  let count = 0;
  for (const source of sources) {
    if (source.type === "drop") {
      count += 1;
    }
    if (source.type === "more-drops" || source.type === "world-drop") {
      count += source.count;
    }
  }
  return count;
}

function isObtainableSource(source) {
  return source.type !== "world-drop" && source.type !== "object";
}

function gettableSources(item, snapshot) {
  return sourcesForCharacter(item, snapshot).filter(isObtainableSource);
}

function skippedDungeons() {
  const character = selectedCharacter();
  if (character === null || !character.skippedDungeons) {
    return [];
  }
  return character.skippedDungeons;
}

function isFromSkippedDungeon(source) {
  const dungeon = dungeonForArea(source.zone);
  return dungeon !== null && skippedDungeons().indexOf(dungeon.name) !== -1;
}

function obtainableSources(item, snapshot) {
  const sources = [];
  for (const source of gettableSources(item, snapshot)) {
    if (!isFromSkippedDungeon(source)) {
      sources.push(source);
    }
  }
  return sources;
}

function isListedOnAuctionHouse(item) {
  const price = priceFor(item.id);
  return price !== null && price.listed > 0;
}

function goldLimitInCopper() {
  const character = selectedCharacter();
  if (character === null || character.maxGoldPerUpgrade === undefined || character.maxGoldPerUpgrade === null) {
    return null;
  }
  return character.maxGoldPerUpgrade * COPPER_PER_GOLD;
}

function isWithinGoldLimit(price) {
  const limit = goldLimitInCopper();
  if (limit === null || price === null || price === undefined) {
    return true;
  }
  return price <= limit;
}

function isBuyableOnAuctionHouse(item) {
  if (item.suffix) {
    return false;
  }
  return isListedOnAuctionHouse(item) && isWithinGoldLimit(averagePrice(item.id));
}

function sourceCost(source, snapshot) {
  if (source.type === "vendor") {
    if (source.price === undefined) {
      return null;
    }
    return source.price;
  }
  if (source.type === "craft") {
    const cost = averageMaterialCost(source, snapshot);
    if (cost.missing > 0) {
      return null;
    }
    return cost.total;
  }
  return 0;
}

function cheapestCost(item, snapshot) {
  let cheapest = null;
  if (!item.suffix && isListedOnAuctionHouse(item)) {
    cheapest = averagePrice(item.id);
  }
  for (const source of obtainableSources(item, snapshot)) {
    const cost = sourceCost(source, snapshot);
    if (cost !== null && (cheapest === null || cost < cheapest)) {
      cheapest = cost;
    }
  }
  return cheapest;
}

function knowsRecipe(snapshot, source) {
  for (const profession of snapshot.professions) {
    if (profession.name === source.profession && (profession.recipeIds || []).indexOf(source.recipeId) !== -1) {
      return true;
    }
  }
  return false;
}

function isEasySource(source, snapshot) {
  if (source.type === "quest") {
    return true;
  }
  if (source.type === "vendor") {
    if (source.price === undefined) {
      return goldLimitInCopper() === null;
    }
    return isWithinGoldLimit(source.price);
  }
  if (source.type === "craft") {
    return knowsRecipe(snapshot, source);
  }
  return false;
}

function hasEasySource(item, snapshot) {
  if (!meetsReputation(item, snapshot)) {
    return false;
  }
  if (isBuyableOnAuctionHouse(item)) {
    return true;
  }
  for (const source of sourcesForCharacter(item, snapshot)) {
    if (isEasySource(source, snapshot)) {
      return true;
    }
  }
  return false;
}

function sourceLevel(source, usableLevel) {
  if (source.type === "quest" && source.level) {
    return source.level;
  }
  if ((source.type === "quest" || source.type === "drop") && source.zone && guideZone(source.zone) !== null) {
    return Math.max(usableLevel, guideZone(source.zone).minLevel);
  }
  return usableLevel;
}

function earliestSourceLevel(item, snapshot) {
  const usableLevel = itemUsableLevel(item, snapshot);
  if (isBuyableOnAuctionHouse(item)) {
    return usableLevel;
  }
  let earliest = null;
  for (const source of obtainableSources(item, snapshot)) {
    const level = sourceLevel(source, usableLevel);
    if (earliest === null || level < earliest) {
      earliest = level;
    }
  }
  if (earliest === null) {
    return usableLevel;
  }
  return earliest;
}

function hasKnownSource(item, snapshot) {
  return obtainableSources(item, snapshot).length > 0 || isBuyableOnAuctionHouse(item);
}

function hasOwnProfessionCraft(item, snapshot) {
  for (const source of sourcesForCharacter(item, snapshot)) {
    if (source.type === "craft" && hasProfession(snapshot, source.profession)) {
      return true;
    }
  }
  return false;
}

function firstQuestSource(sources) {
  for (const source of sources) {
    if (source.type === "quest") {
      return source;
    }
  }
  return null;
}

function equippedItemIds(snapshot) {
  const itemIds = new Set();
  for (const slotKey of Object.keys(snapshot.equipment)) {
    itemIds.add(snapshot.equipment[slotKey].id);
  }
  return itemIds;
}

function itemName(itemId) {
  const item = itemById(itemId);
  if (item === null) {
    return "item " + itemId;
  }
  return item.name;
}

function firstCraftSource(sources) {
  for (const source of sources) {
    if (source.type === "craft") {
      return source;
    }
  }
  return null;
}

function averagePrice(itemId) {
  if (state.tsm === null || !state.tsm.prices[itemId]) {
    return null;
  }
  const price = state.tsm.prices[itemId];
  return price.regionMarketValue || price.marketValue || price.marketValueRecent || price.regionSale || null;
}

function materialUnitPrice(itemId, snapshot) {
  let vendor = null;
  const known = window.FOREVER_CRAFTING_ITEMS[itemId];
  if (known && known.vendorPrice > 0 && isVendorSoldFor(itemId, factionLetter(snapshot.factionType))) {
    vendor = { price: known.vendorPrice * (1 - vendorDiscountRate()) };
  }
  let auction = null;
  if (unitCost(itemId) !== null) {
    auction = { price: unitCost(itemId) };
  }
  const offer = preferredOffer(vendor, auction);
  if (offer === null) {
    return null;
  }
  return offer.price;
}

function averageMaterialCost(source, snapshot) {
  let total = 0;
  let missing = 0;
  for (const reagent of source.reagents) {
    const price = materialUnitPrice(reagent.id, snapshot);
    if (price === null) {
      missing += 1;
    } else {
      total += price * reagent.quantity;
    }
  }
  return { total: total, missing: missing };
}

function itemById(itemId) {
  if (itemIndex.size === 0) {
    for (const item of window.FOREVER_ITEMS) {
      itemIndex.set(item.id, item);
    }
  }
  return itemIndex.get(itemId) || null;
}
