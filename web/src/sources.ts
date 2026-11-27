import "./legacy.ts";
import { dungeonForArea, guideZone } from "./route.ts";
import type { CraftSource, Item, ItemSource, QuestieItemDetail, QuestieQuest, ReputationRequirement, Snapshot } from "./types.ts";
import { isVendorSoldFor, preferredOffer, priceFor, savedBarteringRank, unitCost, vendorDiscountRate } from "./prices.ts";
import { knowsRecipe, professionOf, selectedCharacter, state } from "./state.ts";

export const CLASS_BITS: Record<string, number> = { Warrior: 1, Paladin: 2, Hunter: 4, Rogue: 8, Priest: 16, Shaman: 64, Mage: 128, Warlock: 256, Druid: 1024 };
export const REPUTATION_TIER_NAMES = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"];
const NEUTRAL_REPUTATION_TIER = 3;
const REPUTATION_TIERS_WITHIN_REACH = 1;
const COPPER_PER_GOLD = 10000;
const FARMABLE_DROP_CREATURE_LIMIT = 3;

const completedQuestCache: { snapshot: Snapshot | null; questIds: Set<number> } = { snapshot: null, questIds: new Set() };
const sourceCache: { snapshot: Snapshot | null; questie: unknown; entries: Map<number, ItemSource[]> } = { snapshot: null, questie: null, entries: new Map() };
const itemIndex = new Map<number, Item>();

export function resetSourceCaches(): void {
  completedQuestCache.snapshot = null;
  sourceCache.snapshot = null;
  sourceCache.entries.clear();
  itemIndex.clear();
}

export function clearSourceCache(): void {
  sourceCache.entries.clear();
}

export function itemById(itemId: number): Item | null {
  if (itemIndex.size === 0) {
    for (const item of window.FOREVER_ITEMS) {
      itemIndex.set(item.id, item);
    }
  }
  return itemIndex.get(itemId) || null;
}

export function itemName(itemId: number): string {
  const item = itemById(itemId);
  if (item === null) {
    return "item " + itemId;
  }
  return item.name;
}

export function completedQuests(snapshot: Snapshot): Set<number> {
  if (completedQuestCache.snapshot !== snapshot) {
    completedQuestCache.snapshot = snapshot;
    completedQuestCache.questIds = new Set(snapshot.completedQuestIds || []);
  }
  return completedQuestCache.questIds;
}

function reputationTier(snapshot: Snapshot, factionId: number): number {
  if (snapshot.reputations && snapshot.reputations[factionId] !== undefined) {
    return snapshot.reputations[factionId];
  }
  return NEUTRAL_REPUTATION_TIER;
}

export function itemReputationRequirement(item: Item, snapshot: Snapshot): ReputationRequirement | null {
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

export function meetsReputation(item: Item, snapshot: Snapshot): boolean {
  const requirement = itemReputationRequirement(item, snapshot);
  if (requirement === null) {
    return true;
  }
  return reputationTier(snapshot, requirement.factionId) >= requirement.tier;
}

export function isReputationWithinReach(item: Item, snapshot: Snapshot): boolean {
  const requirement = itemReputationRequirement(item, snapshot);
  if (requirement === null) {
    return true;
  }
  return reputationTier(snapshot, requirement.factionId) >= requirement.tier - REPUTATION_TIERS_WITHIN_REACH;
}

export function reputationRequirementText(item: Item, snapshot: Snapshot): string {
  const requirement = itemReputationRequirement(item, snapshot);
  if (requirement === null) {
    return "";
  }
  const current = REPUTATION_TIER_NAMES[reputationTier(snapshot, requirement.factionId)];
  if (meetsReputation(item, snapshot)) {
    return requirement.text + " (you have it)";
  }
  return requirement.text + " (you're " + current + ")";
}

function questieDetail(item: Item): QuestieItemDetail | null {
  if (state.questie === null) {
    return null;
  }
  return state.questie.items[item.id] || null;
}

function factionLetter(factionType: string): string {
  if (factionType === "ALLIANCE") {
    return "A";
  }
  return "H";
}

function isForClass(classes: number, snapshot: Snapshot): boolean {
  const classBit = CLASS_BITS[snapshot.className];
  return !classes || !classBit || Boolean(classes & classBit);
}

function questieQuestsForCharacter(detail: QuestieItemDetail, snapshot: Snapshot): QuestieQuest[] {
  const quests: QuestieQuest[] = [];
  for (const quest of detail.quests) {
    if (completedQuests(snapshot).has(quest.id)) {
      continue;
    }
    const factionMatches = quest.faction === null || quest.faction === snapshot.factionType;
    if (factionMatches && isForClass(quest.classes, snapshot)) {
      quests.push(quest);
    }
  }
  return quests;
}

export function itemFaction(item: Item): string | null {
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

export function armorTrainingLevel(className: string, armorType: string): number {
  const proficiencies = window.GAME_RULES.classProficiencies[className];
  if (!proficiencies || !proficiencies.armorFromLevel) {
    return 0;
  }
  return proficiencies.armorFromLevel[armorType] || 0;
}

export function itemUsableLevel(item: Item, snapshot: Snapshot): number {
  let level = itemRequiredLevel(item, snapshot);
  if (item.itemClass === "Armor") {
    level = Math.max(level, armorTrainingLevel(snapshot.className, item.itemSubclass));
  }
  return level;
}

function itemRequiredLevel(item: Item, snapshot: Snapshot): number {
  const usableLevel = item.usableLevel || 1;
  if (!item.levelEstimated) {
    return usableLevel;
  }
  const detail = questieDetail(item);
  if (detail === null) {
    return usableLevel;
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
  return usableLevel;
}

export function isLevelEstimated(item: Item, snapshot: Snapshot): boolean {
  return Boolean(item.levelEstimated) && itemRequiredLevel(item, snapshot) === item.usableLevel && itemUsableLevel(item, snapshot) === item.usableLevel;
}

export function questieQuest(questId: number | undefined): QuestieQuest | null {
  if (state.questie === null || !state.questie.quests || questId === undefined) {
    return null;
  }
  return state.questie.quests[questId] || null;
}

export function isQuestForCharacter(questId: number | undefined, snapshot: Snapshot): boolean {
  if (questId === undefined) {
    return false;
  }
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
  return isForClass(quest.classes, snapshot);
}

export function sourcesForCharacter(item: Item, snapshot: Snapshot): ItemSource[] {
  if (sourceCache.snapshot !== snapshot || sourceCache.questie !== state.questie) {
    sourceCache.snapshot = snapshot;
    sourceCache.questie = state.questie;
    sourceCache.entries.clear();
  }
  let sources = sourceCache.entries.get(item.id);
  if (sources === undefined) {
    sources = collectSourcesForCharacter(item, snapshot);
    sourceCache.entries.set(item.id, sources);
  }
  return sources;
}

const OWNED_PLACES: ("bags" | "bank" | "mail")[] = ["bags", "bank", "mail"];
const OWNED_PLACE_NAMES: Record<string, string> = { bags: "bags", bank: "bank", mail: "mailbox" };

function inventoryInScope(snapshot: Snapshot) {
  if (state.inventory === null) {
    return [];
  }
  const characters = state.inventory.characters;
  return Object.keys(characters).map(function characterOf(name) {
    return characters[name];
  }).filter(function isSameRealmAndFaction(character) {
    return character.ruleset === snapshot.ruleset && character.faction === snapshot.faction;
  });
}

function ownedSources(item: Item, snapshot: Snapshot): ItemSource[] {
  const selected = selectedCharacter();
  const ownName = (selected && selected.displayName) || "";
  const sources: ItemSource[] = [];
  for (const character of inventoryInScope(snapshot)) {
    const isOwn = character.name === ownName;
    if (!isOwn && item.binding === "ON_ACQUIRE") {
      continue;
    }
    for (const place of OWNED_PLACES) {
      if (character[place][item.id]) {
        sources.push({ type: "owned", holder: character.name, place: OWNED_PLACE_NAMES[place], isOwn: isOwn });
      }
    }
  }
  return sources;
}

interface QuestContext {
  questieQuests: Map<number, QuestieQuest>;
  otherFactionQuestIds: Set<number>;
}

function questContext(detail: QuestieItemDetail | null, snapshot: Snapshot): QuestContext {
  const context: QuestContext = { questieQuests: new Map(), otherFactionQuestIds: new Set() };
  if (detail === null) {
    return context;
  }
  for (const quest of questieQuestsForCharacter(detail, snapshot)) {
    context.questieQuests.set(quest.id, quest);
  }
  for (const quest of detail.quests) {
    if (quest.faction !== null && quest.faction !== snapshot.factionType) {
      context.otherFactionQuestIds.add(quest.id);
    }
  }
  return context;
}

function withQuestLevel(source: ItemSource, questId: number, context: QuestContext): ItemSource {
  const characterQuest = context.questieQuests.get(questId);
  if (characterQuest !== undefined) {
    return Object.assign({}, source, { level: characterQuest.questLevel });
  }
  const knownQuest = questieQuest(questId);
  if (!source.level && knownQuest !== null) {
    return Object.assign({}, source, { level: knownQuest.questLevel });
  }
  return source;
}

function itemDataSources(item: Item, snapshot: Snapshot, context: QuestContext, listedQuestIds: Set<number>): ItemSource[] {
  const sources: ItemSource[] = [];
  for (const source of item.sources || []) {
    if (source.faction && source.faction !== snapshot.factionType) {
      continue;
    }
    if (source.type !== "quest" || source.questId === undefined) {
      sources.push(source);
      continue;
    }
    if (context.otherFactionQuestIds.has(source.questId) || !isQuestForCharacter(source.questId, snapshot)) {
      continue;
    }
    listedQuestIds.add(source.questId);
    sources.push(withQuestLevel(source, source.questId, context));
  }
  return sources;
}

function unlistedQuestieQuests(context: QuestContext, listedQuestIds: Set<number>): ItemSource[] {
  const sources: ItemSource[] = [];
  for (const quest of context.questieQuests.values()) {
    if (!listedQuestIds.has(quest.id)) {
      sources.push({ type: "quest", questId: quest.id, quest: quest.name, zone: quest.zone, level: quest.questLevel });
    }
  }
  return sources;
}

function questieWorldSources(item: Item, detail: QuestieItemDetail, snapshot: Snapshot): ItemSource[] {
  const sources: ItemSource[] = [];
  const ownLetter = factionLetter(snapshot.factionType);
  const dropCreatures = dropCreatureCount(detail.sources);
  const isWorldDrop = dropCreatures > FARMABLE_DROP_CREATURE_LIMIT;
  if (isWorldDrop) {
    sources.push({ type: "world-drop", count: dropCreatures });
  }
  for (const source of detail.sources) {
    if (isWorldDrop && isDropSource(source)) {
      continue;
    }
    const friendlyTo = source.friendlyTo;
    if (source.type === "vendor" && typeof friendlyTo === "string" && friendlyTo.indexOf(ownLetter) === -1) {
      continue;
    }
    if (source.type === "vendor" && item.vendorPrice) {
      sources.push(Object.assign({}, source, { price: item.vendorPrice * (1 - vendorDiscountRate(savedBarteringRank())) }));
      continue;
    }
    sources.push(source);
  }
  return sources;
}

function collectSourcesForCharacter(item: Item, snapshot: Snapshot): ItemSource[] {
  const detail = questieDetail(item);
  const context = questContext(detail, snapshot);
  const listedQuestIds = new Set<number>();
  const sources = ownedSources(item, snapshot).concat(itemDataSources(item, snapshot, context, listedQuestIds));
  if (detail === null) {
    return sources;
  }
  return sources.concat(unlistedQuestieQuests(context, listedQuestIds), questieWorldSources(item, detail, snapshot));
}

function isDropSource(source: ItemSource): boolean {
  return source.type === "drop" || source.type === "more-drops" || source.type === "world-drop";
}

function dropCreatureCount(sources: ItemSource[]): number {
  let count = 0;
  for (const source of sources) {
    if (source.type === "drop") {
      count += 1;
    }
    if (source.type === "more-drops" || source.type === "world-drop") {
      count += source.count || 0;
    }
  }
  return count;
}

function isObtainableSource(source: ItemSource): boolean {
  return source.type !== "world-drop" && source.type !== "object";
}

function gettableSources(item: Item, snapshot: Snapshot): ItemSource[] {
  return sourcesForCharacter(item, snapshot).filter(isObtainableSource);
}

export function itemDungeons(item: Item, snapshot: Snapshot): Set<string> {
  const names = new Set<string>();
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

export function skippedDungeons(): string[] {
  const character = selectedCharacter();
  if (character === null || !character.skippedDungeons) {
    return [];
  }
  return character.skippedDungeons;
}

function isFromSkippedDungeon(source: ItemSource): boolean {
  const dungeon = dungeonForArea(source.zone);
  return dungeon !== null && skippedDungeons().indexOf(dungeon.name) !== -1;
}

export function obtainableSources(item: Item, snapshot: Snapshot): ItemSource[] {
  const sources: ItemSource[] = [];
  for (const source of gettableSources(item, snapshot)) {
    if (!isFromSkippedDungeon(source)) {
      sources.push(source);
    }
  }
  return sources;
}

function isListedOnAuctionHouse(item: Item): boolean {
  const price = priceFor(item.id);
  return price !== null && price.listed > 0;
}

function goldLimitInCopper(): number | null {
  const character = selectedCharacter();
  if (character === null || character.maxGoldPerUpgrade === undefined || character.maxGoldPerUpgrade === null) {
    return null;
  }
  return character.maxGoldPerUpgrade * COPPER_PER_GOLD;
}

export function isWithinGoldLimit(price: number | null | undefined): boolean {
  const limit = goldLimitInCopper();
  if (limit === null || price === null || price === undefined) {
    return true;
  }
  return price <= limit;
}

export function isBuyableOnAuctionHouse(item: Item): boolean {
  if (item.suffix) {
    return false;
  }
  return isListedOnAuctionHouse(item) && isWithinGoldLimit(averagePrice(item.id));
}

function isCraftSource(source: ItemSource): source is CraftSource {
  return source.type === "craft";
}

function sourceCost(source: ItemSource, snapshot: Snapshot): number | null {
  if (source.type === "vendor") {
    if (source.price === undefined) {
      return null;
    }
    return source.price;
  }
  if (isCraftSource(source)) {
    const cost = averageMaterialCost(source, snapshot);
    if (cost.missing > 0) {
      return null;
    }
    return cost.total;
  }
  return 0;
}

export function cheapestCost(item: Item, snapshot: Snapshot): number | null {
  let cheapest: number | null = null;
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

export function isEasySource(source: ItemSource, snapshot: Snapshot): boolean {
  if (source.type === "quest" || source.type === "owned") {
    return true;
  }
  if (source.type === "vendor") {
    if (source.price === undefined) {
      return goldLimitInCopper() === null;
    }
    return isWithinGoldLimit(source.price);
  }
  if (isCraftSource(source)) {
    return knowsRecipe(snapshot, source.profession, source.recipeId);
  }
  return false;
}

export function hasEasySource(item: Item, snapshot: Snapshot): boolean {
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

function sourceLevel(source: ItemSource, usableLevel: number): number {
  if (source.type === "quest" && source.level) {
    return source.level;
  }
  const zone = guideZone(source.zone);
  if ((source.type === "quest" || source.type === "drop") && zone !== null) {
    return Math.max(usableLevel, zone.minLevel);
  }
  return usableLevel;
}

export function earliestSourceLevel(item: Item, snapshot: Snapshot): number {
  const usableLevel = itemUsableLevel(item, snapshot);
  if (isBuyableOnAuctionHouse(item)) {
    return usableLevel;
  }
  let earliest: number | null = null;
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

export function hasKnownSource(item: Item, snapshot: Snapshot): boolean {
  return obtainableSources(item, snapshot).length > 0 || isBuyableOnAuctionHouse(item);
}

export function hasOwnProfessionCraft(item: Item, snapshot: Snapshot): boolean {
  for (const source of sourcesForCharacter(item, snapshot)) {
    if (isCraftSource(source) && professionOf(snapshot, source.profession) !== null) {
      return true;
    }
  }
  return false;
}

export function firstCraftSource(sources: ItemSource[]): CraftSource | null {
  for (const source of sources) {
    if (isCraftSource(source)) {
      return source;
    }
  }
  return null;
}

export function equippedItemIds(snapshot: Snapshot): Set<number> {
  const itemIds = new Set<number>();
  for (const equipped of Object.values(snapshot.equipment)) {
    if (equipped !== undefined) {
      itemIds.add(equipped.id);
    }
  }
  return itemIds;
}

export function averagePrice(itemId: number): number | null {
  if (state.tsm === null || !state.tsm.prices[itemId]) {
    return null;
  }
  const price = state.tsm.prices[itemId];
  return price.regionMarketValue || price.marketValue || price.marketValueRecent || price.regionSale || null;
}

function materialUnitPrice(itemId: number, snapshot: Snapshot): number | null {
  let vendor: { price: number } | null = null;
  const known = window.FOREVER_CRAFTING_ITEMS[itemId];
  if (known && known.vendorPrice && known.vendorPrice > 0 && isVendorSoldFor(itemId, factionLetter(snapshot.factionType))) {
    vendor = { price: known.vendorPrice * (1 - vendorDiscountRate(savedBarteringRank())) };
  }
  let auction: { price: number } | null = null;
  const auctionPrice = unitCost(itemId);
  if (auctionPrice !== null) {
    auction = { price: auctionPrice };
  }
  const offer = preferredOffer(vendor, auction);
  if (offer === null) {
    return null;
  }
  return offer.price;
}

export function averageMaterialCost(source: CraftSource, snapshot: Snapshot): { total: number; missing: number } {
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
