import "../legacy.ts";
import { dungeonForArea, isRouteActive, routeLegs } from "../route.ts";
import { characterWeights, comparisonBaseline, itemScore, itemWithSuffix, slotDefinitionByKey, slotItemTypes } from "../scoring.ts";
import { averageMaterialCost, averagePrice, equippedItemIds, firstCraftSource, isBuyableOnAuctionHouse, itemById, obtainableSources } from "../sources.ts";
import { STORAGE_KEYS, readStorage, saveSettings, selectedCharacter, state } from "../state.ts";
import type { Character, CraftSource, Item, ItemSource, RouteLeg, Snapshot } from "../types.ts";
import { routeAvailability } from "../upgrades.ts";

export interface PlanPick {
  itemId: number;
  suffixName?: string;
}

export type PlanKind = "owned" | "quest" | "drop" | "vendor" | "craft" | "auction" | "unknown";

export interface PlanEntry {
  key: string;
  slotKey: string;
  slotLabel: string;
  item: Item;
  kind: PlanKind;
  source: ItemSource | null;
  price: number | null;
}

export interface PlanGroup {
  key: string;
  title: string;
  entries: PlanEntry[];
}

interface Placement {
  key: string;
  title: string;
  order: number;
  sortName: string;
  kind: PlanKind;
  source: ItemSource | null;
}

const OWNED_ORDER = -1;
const BUY_ORDER = 0;
const CRAFT_ORDER = 1;
const ROUTE_ORDER = 1000;
const ELSEWHERE_ORDER = 2000;
const OTHER_ORDER = 4000;
const DUNGEON_AFTER_ZONE = 0.5;

type StoredPlan = Record<string, PlanPick[] | PlanPick>;

export function characterPlan(character: Character): Record<string, PlanPick[]> {
  if (!character.plan) {
    character.plan = {};
  }
  return character.plan as Record<string, PlanPick[]>;
}

export function slotPicks(plan: StoredPlan, slotKey: string): PlanPick[] {
  const picks = plan[slotKey];
  if (!picks) {
    return [];
  }
  if (Array.isArray(picks)) {
    return picks;
  }
  return [picks];
}

function entryKey(slotKey: string, item: Item): string {
  let suffixName = "";
  if (item.suffix) {
    suffixName = item.suffix.name;
  }
  return slotKey + ":" + item.id + ":" + suffixName;
}

function isSamePick(pick: PlanPick, item: Item): boolean {
  return pick.itemId === item.id && (pick.suffixName || "") === ((item.suffix && item.suffix.name) || "");
}

function pickOf(item: Item): PlanPick {
  if (item.suffix) {
    return { itemId: item.id, suffixName: item.suffix.name };
  }
  return { itemId: item.id };
}

export function isPicked(character: Character, slotKey: string, item: Item): boolean {
  return slotPicks(characterPlan(character), slotKey).some(function matches(pick) {
    return isSamePick(pick, item);
  });
}

function setSlotPicks(plan: Record<string, PlanPick[]>, slotKey: string, picks: PlanPick[]): void {
  if (picks.length === 0) {
    delete plan[slotKey];
  } else {
    plan[slotKey] = picks;
  }
}

function withoutItem(picks: PlanPick[], item: Item): PlanPick[] {
  return picks.filter(function isOther(pick) {
    return !isSamePick(pick, item);
  });
}

export function togglePick(slotKey: string, item: Item): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  const plan = characterPlan(character);
  const picks = slotPicks(plan, slotKey);
  if (isPicked(character, slotKey, item)) {
    setSlotPicks(plan, slotKey, withoutItem(picks, item));
  } else {
    setSlotPicks(plan, slotKey, picks.concat([pickOf(item)]));
  }
  saveSettings();
}

export function removePick(slotKey: string, item: Item): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  const plan = characterPlan(character);
  setSlotPicks(plan, slotKey, withoutItem(slotPicks(plan, slotKey), item));
  saveSettings();
}

export function pickedItem(pick: PlanPick): Item | null {
  const item = itemById(pick.itemId);
  if (item === null || !pick.suffixName) {
    return item;
  }
  for (const suffix of item.randomSuffixes || []) {
    if (suffix.name === pick.suffixName) {
      return itemWithSuffix(item, suffix);
    }
  }
  return item;
}

function routeLegIndex(character: Character, snapshot: Snapshot, leg: RouteLeg): number {
  const legs = routeLegs(character, snapshot);
  for (let index = 0; index < legs.length; index += 1) {
    if (legs[index].zone === leg.zone && legs[index].fromLevel === leg.fromLevel) {
      return index;
    }
  }
  return 0;
}

function sourceInZone(sources: ItemSource[], zone: string): ItemSource | null {
  for (const type of ["quest", "drop"]) {
    for (const source of sources) {
      if (source.type === type && source.zone === zone) {
        return source;
      }
    }
  }
  return null;
}

function firstOfType(sources: ItemSource[], type: string): ItemSource | null {
  for (const source of sources) {
    if (source.type === type) {
      return source;
    }
  }
  return null;
}

function routePlacement(item: Item, snapshot: Snapshot, character: Character, sources: ItemSource[]): Placement | null {
  if (!isRouteActive(character)) {
    return null;
  }
  const availability = routeAvailability(item, snapshot, character);
  if (availability === null || availability.leg === null || availability.leg.dungeon) {
    return null;
  }
  const leg = availability.leg;
  const source = sourceInZone(sources, leg.zone as string);
  if (source === null) {
    return null;
  }
  return legPlacement(leg, character, snapshot, source);
}

function legPlacement(leg: RouteLeg, character: Character, snapshot: Snapshot, source: ItemSource): Placement {
  return {
    key: "route:" + leg.zone + ":" + leg.fromLevel,
    title: leg.zone + " (" + leg.fromLevel + "–" + leg.toLevel + ")",
    order: ROUTE_ORDER + routeLegIndex(character, snapshot, leg),
    sortName: leg.zone as string,
    kind: source.type as PlanKind,
    source: source
  };
}

function zonePlacement(zoneName: string, source: ItemSource): Placement {
  return { key: "place:" + zoneName, title: zoneName, order: ELSEWHERE_ORDER, sortName: zoneName, kind: source.type as PlanKind, source: source };
}

function vendorPlacement(vendor: ItemSource, snapshot: Snapshot, character: Character): Placement {
  if (!vendor.zone) {
    return { key: "vendors", title: "Vendors", order: ELSEWHERE_ORDER, sortName: "~Vendors", kind: "vendor", source: vendor };
  }
  const leg = routeLegOfZone(character, snapshot, vendor.zone);
  if (leg !== null) {
    return legPlacement(leg, character, snapshot, vendor);
  }
  return zonePlacement(vendor.zone, vendor);
}

function zoneOfDungeon(dungeonName: string): string | null {
  for (const zone of window.ZONE_GUIDE.zones) {
    for (const dungeon of zone.dungeons || []) {
      if (dungeon.name === dungeonName) {
        return zone.name;
      }
    }
  }
  return null;
}

function routeLegOfZone(character: Character, snapshot: Snapshot, zoneName: string): RouteLeg | null {
  if (!isRouteActive(character)) {
    return null;
  }
  for (const leg of routeLegs(character, snapshot)) {
    if (leg.zone === zoneName) {
      return leg;
    }
  }
  return null;
}

function dungeonPlacement(dungeonName: string, source: ItemSource, snapshot: Snapshot, character: Character): Placement {
  const zoneName = zoneOfDungeon(dungeonName);
  const key = "dungeon:" + dungeonName;
  if (zoneName === null) {
    return { key: key, title: dungeonName + " (dungeon)", order: ELSEWHERE_ORDER, sortName: dungeonName, kind: source.type as PlanKind, source: source };
  }
  const title = dungeonName + " (dungeon in " + zoneName + ")";
  const leg = routeLegOfZone(character, snapshot, zoneName);
  if (leg === null) {
    return { key: key, title: title, order: ELSEWHERE_ORDER, sortName: zoneName + " ~" + dungeonName, kind: source.type as PlanKind, source: source };
  }
  return { key: key, title: title, order: ROUTE_ORDER + routeLegIndex(character, snapshot, leg) + DUNGEON_AFTER_ZONE, sortName: title, kind: source.type as PlanKind, source: source };
}

function freePlacement(sources: ItemSource[], snapshot: Snapshot, character: Character): Placement | null {
  const source = firstOfType(sources, "quest") || firstOfType(sources, "drop");
  if (source === null || !source.zone) {
    return null;
  }
  const dungeon = dungeonForArea(source.zone);
  if (dungeon !== null) {
    return dungeonPlacement(dungeon.name, source, snapshot, character);
  }
  return zonePlacement(source.zone, source);
}

function placement(item: Item, snapshot: Snapshot, character: Character): Placement {
  const sources = obtainableSources(item, snapshot);
  const owned = firstOfType(sources, "owned");
  if (owned !== null) {
    return { key: "owned", title: "You have it", order: OWNED_ORDER, sortName: "Owned", kind: "owned", source: owned };
  }
  const onRoute = routePlacement(item, snapshot, character, sources);
  if (onRoute !== null) {
    return onRoute;
  }
  const free = freePlacement(sources, snapshot, character);
  if (free !== null) {
    return free;
  }
  const vendor = firstOfType(sources, "vendor");
  if (vendor !== null) {
    return vendorPlacement(vendor, snapshot, character);
  }
  const craft = firstCraftSource(sources);
  if (craft !== null) {
    return { key: "craft", title: "Craft", order: CRAFT_ORDER, sortName: "Craft", kind: "craft", source: craft };
  }
  if (isBuyableOnAuctionHouse(item)) {
    return { key: "buy", title: "Buy on the auction house", order: BUY_ORDER, sortName: "Buy", kind: "auction", source: null };
  }
  return { key: "other", title: "Other", order: OTHER_ORDER, sortName: "Other", kind: "unknown", source: null };
}

function entryPrice(kind: PlanKind, item: Item, source: ItemSource | null, snapshot: Snapshot): number | null {
  if (kind === "auction") {
    return averagePrice(item.id);
  }
  if (kind === "vendor" && source !== null && source.price !== undefined) {
    return source.price as number;
  }
  if (kind === "craft" && source !== null) {
    const cost = averageMaterialCost(source as CraftSource, snapshot);
    if (cost.missing === 0) {
      return cost.total;
    }
  }
  return null;
}

type SortedGroup = PlanGroup & { order: number; sortName: string };

function compareGroups(first: SortedGroup, second: SortedGroup): number {
  if (first.order !== second.order) {
    return first.order - second.order;
  }
  return first.sortName.localeCompare(second.sortName);
}

export function planGroups(character: Character, snapshot: Snapshot): PlanGroup[] {
  const groups = new Map<string, SortedGroup>();
  const plan = characterPlan(character);
  for (const slotKey of Object.keys(plan)) {
    const slotDefinition = slotDefinitionByKey(slotKey);
    if (slotDefinition === null) {
      continue;
    }
    for (const pick of slotPicks(plan, slotKey)) {
      const item = pickedItem(pick);
      if (item === null) {
        continue;
      }
      const place = placement(item, snapshot, character);
      const group = groups.get(place.key) || { key: place.key, title: place.title, order: place.order, sortName: place.sortName, entries: [] };
      group.entries.push({ key: entryKey(slotKey, item), slotKey: slotKey, slotLabel: slotDefinition.label, item: item, kind: place.kind, source: place.source, price: entryPrice(place.kind, item, place.source, snapshot) });
      groups.set(place.key, group);
    }
  }
  return Array.from(groups.values()).sort(compareGroups);
}

export function craftedPlanItemIds(character: Character, snapshot: Snapshot): number[] {
  const itemIds: number[] = [];
  for (const group of planGroups(character, snapshot)) {
    for (const entry of group.entries) {
      if (entry.kind === "craft") {
        itemIds.push(entry.item.id);
      }
    }
  }
  return itemIds;
}

export function craftAllHref(itemIds: number[]): string {
  return "crafting.html#items=" + itemIds.map(function withQuantity(itemId) {
    return itemId + ":1";
  }).join(",");
}

function isStillAnUpgrade(slotKey: string, item: Item, character: Character, snapshot: Snapshot): boolean {
  const slotDefinition = slotDefinitionByKey(slotKey);
  if (slotDefinition === null) {
    return false;
  }
  const weights = characterWeights(character);
  return itemScore(item, weights, slotKey) > comparisonBaseline(slotDefinition, snapshot, item, weights);
}

export function pruneGearPlan(character: Character, snapshot: Snapshot): string[] {
  const plan = characterPlan(character);
  const equipped = equippedItemIds(snapshot);
  const removedNames: string[] = [];
  for (const slotKey of Object.keys(plan)) {
    const kept: PlanPick[] = [];
    for (const pick of slotPicks(plan, slotKey)) {
      const item = pickedItem(pick);
      if (item !== null && !equipped.has(item.id) && isStillAnUpgrade(slotKey, item, character, snapshot)) {
        kept.push(pick);
      } else if (item !== null) {
        removedNames.push(item.name);
      }
    }
    setSlotPicks(plan, slotKey, kept);
  }
  saveSettings();
  return removedNames;
}

function slotFor(item: Item, snapshot: Snapshot): string | null {
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    if (!slotDefinition.cosmetic && slotItemTypes(slotDefinition, snapshot).indexOf(item.slot) !== -1) {
      return slotDefinition.key;
    }
  }
  return null;
}

function addOldEntries(character: Character, snapshot: Snapshot, itemIds: number[]): void {
  const plan = characterPlan(character);
  for (const itemId of itemIds) {
    const item = itemById(itemId);
    if (item === null) {
      continue;
    }
    const slotKey = slotFor(item, snapshot);
    if (slotKey !== null && !isPicked(character, slotKey, item)) {
      setSlotPicks(plan, slotKey, slotPicks(plan, slotKey).concat([{ itemId: itemId }]));
    }
  }
}

function listEveryPlanSlot(character: Character): boolean {
  const plan = (character.plan || {}) as StoredPlan;
  let changed = false;
  for (const slotKey of Object.keys(plan)) {
    if (!Array.isArray(plan[slotKey])) {
      plan[slotKey] = slotPicks(plan, slotKey);
      changed = true;
    }
  }
  return changed;
}

export function moveOldListsIntoPlans(): void {
  let changed = false;
  const cart = readStorage<{ itemId: number }[]>(STORAGE_KEYS.craftingCart, []);
  for (const character of state.settings.characters) {
    changed = listEveryPlanSlot(character) || changed;
    const snapshot = state.snapshots[character.slug];
    const questList = (character.questList || []) as { itemId: number }[];
    if (character.plan || !snapshot) {
      continue;
    }
    const itemIds = questList.map(function itemOf(entry) {
      return entry.itemId;
    });
    if (character.slug === state.settings.selectedCharacterSlug) {
      for (const entry of cart) {
        itemIds.push(Number(entry.itemId));
      }
    }
    addOldEntries(character, snapshot, itemIds);
    delete character.questList;
    changed = true;
  }
  if (changed) {
    saveSettings();
  }
}
