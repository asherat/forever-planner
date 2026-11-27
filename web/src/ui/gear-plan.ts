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

export type PlanKind = "quest" | "drop" | "vendor" | "craft" | "auction" | "unknown";

export interface PlanEntry {
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
  kind: PlanKind;
  source: ItemSource | null;
}

const ROUTE_ORDER = 0;
const ELSEWHERE_ORDER = 1000;
const BUY_ORDER = 2000;
const CRAFT_ORDER = 3000;
const OTHER_ORDER = 4000;

export function characterPlan(character: Character): Record<string, PlanPick> {
  if (!character.plan) {
    character.plan = {};
  }
  return character.plan as Record<string, PlanPick>;
}

function pickOf(item: Item): PlanPick {
  if (item.suffix) {
    return { itemId: item.id, suffixName: item.suffix.name };
  }
  return { itemId: item.id };
}

export function isPicked(character: Character, slotKey: string, item: Item): boolean {
  const pick = characterPlan(character)[slotKey];
  if (!pick || pick.itemId !== item.id) {
    return false;
  }
  return (pick.suffixName || "") === ((item.suffix && item.suffix.name) || "");
}

export function togglePick(slotKey: string, item: Item): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  const plan = characterPlan(character);
  if (isPicked(character, slotKey, item)) {
    delete plan[slotKey];
  } else {
    plan[slotKey] = pickOf(item);
  }
  saveSettings();
}

export function removePick(slotKey: string): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  delete characterPlan(character)[slotKey];
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
  return {
    key: "route:" + leg.zone + ":" + leg.fromLevel,
    title: leg.zone + " (" + leg.fromLevel + "–" + leg.toLevel + ")",
    order: ROUTE_ORDER + routeLegIndex(character, snapshot, leg),
    kind: source.type as PlanKind,
    source: source
  };
}

function freePlacement(sources: ItemSource[]): Placement | null {
  const source = firstOfType(sources, "quest") || firstOfType(sources, "drop");
  if (source === null || !source.zone) {
    return null;
  }
  const dungeon = dungeonForArea(source.zone);
  let title = source.zone;
  if (dungeon !== null) {
    title = dungeon.name + " (dungeon)";
  }
  return { key: "place:" + title, title: title, order: ELSEWHERE_ORDER, kind: source.type as PlanKind, source: source };
}

function placement(item: Item, snapshot: Snapshot, character: Character): Placement {
  const sources = obtainableSources(item, snapshot);
  const onRoute = routePlacement(item, snapshot, character, sources);
  if (onRoute !== null) {
    return onRoute;
  }
  const free = freePlacement(sources);
  if (free !== null) {
    return free;
  }
  const vendor = firstOfType(sources, "vendor");
  if (vendor !== null) {
    return { key: "buy", title: "Buy", order: BUY_ORDER, kind: "vendor", source: vendor };
  }
  const craft = firstCraftSource(sources);
  if (craft !== null) {
    return { key: "craft", title: "Craft", order: CRAFT_ORDER, kind: "craft", source: craft };
  }
  if (isBuyableOnAuctionHouse(item)) {
    return { key: "buy", title: "Buy", order: BUY_ORDER, kind: "auction", source: null };
  }
  return { key: "other", title: "Other", order: OTHER_ORDER, kind: "unknown", source: null };
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

function compareGroups(first: PlanGroup & { order: number }, second: PlanGroup & { order: number }): number {
  if (first.order !== second.order) {
    return first.order - second.order;
  }
  return first.title.localeCompare(second.title);
}

export function planGroups(character: Character, snapshot: Snapshot): PlanGroup[] {
  const groups = new Map<string, PlanGroup & { order: number }>();
  const plan = characterPlan(character);
  for (const slotKey of Object.keys(plan)) {
    const item = pickedItem(plan[slotKey]);
    const slotDefinition = slotDefinitionByKey(slotKey);
    if (item === null || slotDefinition === null) {
      continue;
    }
    const place = placement(item, snapshot, character);
    const group = groups.get(place.key) || { key: place.key, title: place.title, order: place.order, entries: [] };
    group.entries.push({ slotKey: slotKey, slotLabel: slotDefinition.label, item: item, kind: place.kind, source: place.source, price: entryPrice(place.kind, item, place.source, snapshot) });
    groups.set(place.key, group);
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
    const item = pickedItem(plan[slotKey]);
    if (item === null || equipped.has(item.id) || !isStillAnUpgrade(slotKey, item, character, snapshot)) {
      if (item !== null) {
        removedNames.push(item.name);
      }
      delete plan[slotKey];
    }
  }
  saveSettings();
  return removedNames;
}

function freeSlotFor(item: Item, plan: Record<string, PlanPick>, snapshot: Snapshot): string | null {
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    if (!slotDefinition.cosmetic && !plan[slotDefinition.key] && slotItemTypes(slotDefinition, snapshot).indexOf(item.slot) !== -1) {
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
    const slotKey = freeSlotFor(item, plan, snapshot);
    if (slotKey !== null) {
      plan[slotKey] = { itemId: itemId };
    }
  }
}

export function moveOldListsIntoPlans(): void {
  let changed = false;
  const cart = readStorage<{ itemId: number }[]>(STORAGE_KEYS.craftingCart, []);
  for (const character of state.settings.characters) {
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
