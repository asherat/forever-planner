import "../legacy.ts";
import { guideZone } from "../route.ts";
import { activeSpec, characterWeights, isTwoHanded, specLabel, specPreset, weaponDamageWeight } from "../scoring.ts";
import { averageMaterialCost, averagePrice, isLevelEstimated, itemUsableLevel } from "../sources.ts";
import type { Candidate, Character, CraftSource, Item, ItemSource, SlotDefinition, Snapshot, Stats } from "../types.ts";
import { tierColor } from "./tiers.ts";

const CREATURE_RANKS: Record<string, string> = { 1: "elite", 2: "rare elite", 3: "boss", 4: "rare" };

export interface TooltipLine {
  className: string;
  text: string;
}

export interface Tooltip {
  title: string;
  titleClass: string;
  subtitle: string;
  lines: TooltipLine[];
}

export interface PlaceOnMap {
  zone: string;
  x: number | null;
  y: number | null;
  caption: string;
}

export function joinDetails(parts: (string | undefined)[]): string {
  const filled: string[] = [];
  for (const part of parts) {
    if (part) {
      filled.push(part);
    }
  }
  if (filled.length === 0) {
    return "";
  }
  return " (" + filled.join(", ") + ")";
}

export function creatureLevelText(source: ItemSource): string {
  const minimum = Number(source.minLevel) || 0;
  const maximum = Number(source.maxLevel) || 0;
  if (!minimum) {
    return "";
  }
  if (maximum && maximum !== minimum) {
    return "level " + minimum + "-" + maximum;
  }
  return "level " + minimum;
}

export function creatureRankText(rank: unknown): string {
  return CREATURE_RANKS[String(rank)] || "";
}

export function describeSource(source: ItemSource): string {
  if (source.type === "more-drops") {
    return "…and " + source.count + " more creatures";
  }
  if (source.type === "world-drop") {
    return "World drop (" + source.count + " creatures can drop it)";
  }
  if (source.type === "object") {
    return "Found in " + String(source.name) + joinDetails([source.zone]);
  }
  if (source.type === "craft") {
    return "Crafted: " + String(source.profession);
  }
  return "Unknown source";
}

export function levelText(item: Item, snapshot: Snapshot, prefix: string): string {
  const level = itemUsableLevel(item, snapshot);
  if (isLevelEstimated(item, snapshot)) {
    return "about " + prefix + level;
  }
  return prefix + level;
}

export function statLabel(statKey: string): string {
  const label = window.GAME_RULES.statLabels[statKey];
  if (label) {
    return label;
  }
  const words = statKey.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function differenceText(difference: number): string {
  if (difference > 0) {
    return " (+" + difference + ")";
  }
  if (difference < 0) {
    return " (" + difference + ")";
  }
  return "";
}

function differenceClass(difference: number): string {
  if (difference > 0) {
    return "tooltip-better";
  }
  if (difference < 0) {
    return "tooltip-worse";
  }
  return "";
}

function weaponDamagePerSecond(item: Item | undefined): number {
  if (item && item.weapon) {
    return item.weapon.damagePerSecond;
  }
  return 0;
}

function comparedItems(slotDefinition: SlotDefinition, snapshot: Snapshot, upgradeItem: Item): Item[] {
  const items: Item[] = [];
  const equipped = snapshot.equipment[slotDefinition.key];
  if (equipped) {
    items.push(equipped);
  }
  const offHand = snapshot.equipment.OFF_HAND;
  if (slotDefinition.key === "MAIN_HAND" && isTwoHanded(upgradeItem) && offHand) {
    items.push(offHand);
  }
  return items;
}

function summedStats(items: Item[]): Stats {
  const totals: Stats = {};
  for (const item of items) {
    for (const statKey of Object.keys(item.stats || {})) {
      totals[statKey] = (totals[statKey] || 0) + item.stats[statKey];
    }
  }
  return totals;
}

function slotSubtitle(slotLabel: string, item: Item): string {
  if (item.itemSubclass) {
    return slotLabel + " · " + item.itemSubclass;
  }
  return slotLabel;
}

export function comparisonTooltip(slotDefinition: SlotDefinition, snapshot: Snapshot, character: Character, candidate: Candidate): Tooltip {
  const upgradeItem = candidate.item;
  let subtitle = slotSubtitle(slotDefinition.label, upgradeItem);
  if (itemUsableLevel(upgradeItem, snapshot) > snapshot.level) {
    subtitle += " · " + levelText(upgradeItem, snapshot, "level ");
  }
  const lines: TooltipLine[] = [];
  const currentItems = comparedItems(slotDefinition, snapshot, upgradeItem);
  const currentStats = summedStats(currentItems);
  const upgradeStats = upgradeItem.stats || {};
  const newDamage = weaponDamagePerSecond(upgradeItem);
  if (newDamage > 0) {
    const damageDifference = Math.round((newDamage - weaponDamagePerSecond(currentItems[0])) * 10) / 10;
    let damageClass = differenceClass(damageDifference);
    let damageText = newDamage.toFixed(1) + " damage per second" + differenceText(damageDifference);
    if (weaponDamageWeight(upgradeItem, characterWeights(character), slotDefinition.key) <= 0) {
      damageClass = "tooltip-irrelevant";
      damageText += ", not used by your specs";
    }
    lines.push({ className: damageClass, text: damageText });
  }
  for (const statKey of Object.keys(upgradeStats)) {
    const difference = upgradeStats[statKey] - (currentStats[statKey] || 0);
    lines.push({ className: differenceClass(difference), text: "+" + upgradeStats[statKey] + " " + statLabel(statKey) + differenceText(difference) });
  }
  for (const statKey of Object.keys(currentStats)) {
    if (upgradeStats[statKey] === undefined) {
      lines.push({ className: "tooltip-worse", text: "−" + currentStats[statKey] + " " + statLabel(statKey) + " (lost)" });
    }
  }
  for (const effect of upgradeItem.effects || []) {
    lines.push({ className: "tooltip-effect", text: effect });
  }
  return { title: upgradeItem.name, titleClass: qualityClass(upgradeItem.quality), subtitle: subtitle, lines: lines };
}

export function optionSubtitle(candidate: Candidate, snapshot: Snapshot): string {
  const item = candidate.item;
  if (candidate.availableLevel <= snapshot.level) {
    return item.itemSubclass + " · usable now";
  }
  if (candidate.availableLevel > itemUsableLevel(item, snapshot)) {
    return item.itemSubclass + " · from level " + candidate.availableLevel;
  }
  return item.itemSubclass + " · " + levelText(item, snapshot, "level ");
}

export function gainText(candidate: Candidate, character: Character): { className: string; text: string } {
  const spec = activeSpec(character);
  const label = specLabel(spec);
  const unit = specPreset(spec).unit;
  if (candidate.gain > 0) {
    return { className: "gain gain-positive", text: label + " +" + candidate.gain + " " + unit };
  }
  if (candidate.gain < 0) {
    return { className: "gain gain-negative", text: label + " " + candidate.gain + " " + unit };
  }
  return { className: "gain", text: label + " ±0" };
}

export function routeBadge(candidate: Candidate): { className: string; text: string } | null {
  const leg = candidate.routeLeg;
  if (leg === null) {
    return null;
  }
  if (leg.dungeon) {
    return { className: "route-badge tier-grey", text: "Dungeon: " + leg.zone + ", from level " + leg.fromLevel };
  }
  let tierClass = "tier-grey";
  const zone = guideZone(leg.zone);
  if (zone !== null) {
    tierClass = tierColor(zone.tier);
  }
  return { className: "route-badge " + tierClass, text: "On your path: " + leg.zone + " (" + leg.fromLevel + "–" + leg.toLevel + ")" };
}

export function sourcePlace(source: ItemSource): PlaceOnMap | null {
  if (source.type === "quest") {
    const details = state.questie as Parameters<typeof window.QUESTIE.questStarterFor>[0] | null;
    if (details === null || !details.reader || source.questId === undefined) {
      return null;
    }
    const starter = window.QUESTIE.questStarterFor(details, source.questId);
    if (starter === null || !starter.zone) {
      return null;
    }
    const place = placeForSource(starter);
    return { zone: place.zone, x: place.x, y: place.y, caption: "Quest giver " + starter.name + ", " + place.caption };
  }
  if (source.type === "vendor" || source.type === "drop" || source.type === "object") {
    return placeForSource(source as unknown as { zone: string; x: number | null; y: number | null });
  }
  return null;
}

export interface PricePart {
  kind: "text" | "money";
  text: string;
  copper: number;
}

function textPart(text: string): PricePart {
  return { kind: "text", text: text, copper: 0 };
}

function moneyPart(copper: number): PricePart {
  return { kind: "money", text: "", copper: copper };
}

export function priceParts(item: Item, craftSource: CraftSource | null, snapshot: Snapshot, gain: number, unit: string): PricePart[] {
  const parts: PricePart[] = [];
  if (state.tsm === null) {
    return parts;
  }
  const auctionPrice = averagePrice(item.id);
  if (auctionPrice !== null) {
    parts.push(textPart("AH "), moneyPart(auctionPrice));
    if (item.suffix) {
      parts.push(textPart(" for any suffix"));
    } else if (gain > 0) {
      parts.push(textPart(" (≈ "), moneyPart(Math.round(auctionPrice / gain)), textPart(" per " + unit + ")"));
    }
  }
  if (craftSource !== null) {
    const cost = averageMaterialCost(craftSource, snapshot);
    if (auctionPrice !== null) {
      parts.push(textPart(" · "));
    }
    if (cost.total === 0 && cost.missing > 0) {
      parts.push(textPart("Craft: no material prices yet"));
    } else {
      parts.push(textPart("Craft "), moneyPart(cost.total));
      if (cost.missing > 0) {
        parts.push(textPart(" + unpriced materials"));
      }
    }
  }
  return parts;
}
