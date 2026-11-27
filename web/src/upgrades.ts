import "./legacy.ts";
import { isRouteActive, legsForSource } from "./route.ts";
import { activeSpec, bestGainAnySlot, bestSuffixVariant, canUseItem, characterSpecs, characterWeights, comparisonBaseline, FREE_ON_PATH_GEAR_SHARE, hasGearShare, isTwoHanded, isWorthwhileGain, itemScore, slotDefinitionByKey, slotItemTypes, suitsSpec, weightsForSpec } from "./scoring.ts";
import { cheapestCost, earliestSourceLevel, equippedItemIds, hasEasySource, hasKnownSource, hasOwnProfessionCraft, isBuyableOnAuctionHouse, isReputationWithinReach, isWithinGoldLimit, itemDungeons, itemUsableLevel, obtainableSources, sourcesForCharacter } from "./sources.ts";
import type { BlockList, Candidate, Character, Item, ItemSource, PairedUpgradeOptions, RouteLeg, SlotDefinition, Snapshot, UpgradeOptions } from "./types.ts";
import { state } from "./state.ts";

const QUICKER_PASSES = ["easy-now", "easy-soon", "own-profession", "usable-now"];

type RankingObserver = (candidates: Candidate[], snapshot: Snapshot) => void;
let rankingObserver: RankingObserver | null = null;

export function observeRanking(observer: RankingObserver): void {
  rankingObserver = observer;
}

function compareCandidates(first: Candidate, second: Candidate): number {
  return second.gain - first.gain;
}

export function routeAvailability(item: Item, snapshot: Snapshot, character: Character): { level: number; leg: RouteLeg | null } | null {
  const usableLevel = itemUsableLevel(item, snapshot);
  const sources = obtainableSources(item, snapshot);
  if (sources.length === 0 || isBuyableOnAuctionHouse(item)) {
    return { level: usableLevel, leg: null };
  }
  let best: { level: number; leg: RouteLeg } | null = null;
  for (const source of sources) {
    if (source.type === "vendor" || source.type === "craft" || source.type === "owned") {
      return { level: usableLevel, leg: null };
    }
    if (!source.zone) {
      continue;
    }
    for (const leg of legsForSource(character, snapshot, source)) {
      const level = Math.max(usableLevel, leg.fromLevel, source.level || 0);
      if (level > leg.toLevel + 1) {
        continue;
      }
      if (best === null || level < best.level) {
        best = { level: level, leg: leg };
      }
    }
  }
  return best;
}

function isFreeSource(source: ItemSource): boolean {
  return source.type === "quest" || source.type === "drop";
}

function isZoneLeg(leg: RouteLeg): boolean {
  return !leg.dungeon;
}

export function isFreeOnRoute(item: Item, snapshot: Snapshot, character: Character): boolean {
  for (const source of obtainableSources(item, snapshot)) {
    if (isFreeSource(source) && legsForSource(character, snapshot, source).some(isZoneLeg)) {
      return true;
    }
  }
  return false;
}

export function rankedCandidatesForSlot(slotDefinition: SlotDefinition, snapshot: Snapshot, character: Character): Candidate[] {
  const equipment = snapshot.equipment;
  if (slotDefinition.key === "OFF_HAND" && isTwoHanded(equipment.MAIN_HAND)) {
    return [];
  }
  const itemTypes = slotItemTypes(slotDefinition, snapshot);
  const maximumLevel = snapshot.level + Number(state.settings.lookaheadLevels);
  const weights = characterWeights(character);
  const equippedIds = equippedItemIds(snapshot);
  const hiddenIds = new Set(character.hiddenItemIds || []);
  const routeActive = isRouteActive(character);
  const specKey = activeSpec(character);
  const candidates: Candidate[] = [];
  for (const item of window.FOREVER_ITEMS) {
    if (itemTypes.indexOf(item.slot) === -1 || equippedIds.has(item.id) || hiddenIds.has(item.id)) {
      continue;
    }
    if (!canUseItem(item, snapshot) || !suitsSpec(item, specKey, snapshot) || !isReputationWithinReach(item, snapshot)) {
      continue;
    }
    const variant = bestSuffixVariant(item, weights, slotDefinition.key);
    const gain = itemScore(variant, weights, slotDefinition.key) - comparisonBaseline(slotDefinition, snapshot, variant, weights);
    if (gain <= 0 || !hasKnownSource(variant, snapshot) || !isWithinGoldLimit(cheapestCost(variant, snapshot))) {
      continue;
    }
    if (!isWorthwhileGain(gain, snapshot, weights) && !(routeActive && hasGearShare(gain, snapshot, weights, FREE_ON_PATH_GEAR_SHARE) && isFreeOnRoute(variant, snapshot, character))) {
      continue;
    }
    let availableLevel = Math.max(itemUsableLevel(item, snapshot), earliestSourceLevel(variant, snapshot));
    let routeLeg: RouteLeg | null = null;
    if (routeActive) {
      const availability = routeAvailability(variant, snapshot, character);
      if (availability === null) {
        continue;
      }
      availableLevel = availability.level;
      routeLeg = availability.leg;
    }
    if (availableLevel > maximumLevel) {
      continue;
    }
    candidates.push({ item: variant, availableLevel: availableLevel, routeLeg: routeLeg, gain: Math.round(gain * 10) / 10 });
  }
  candidates.sort(compareCandidates);
  if (rankingObserver !== null) {
    rankingObserver(candidates, snapshot);
  }
  return candidates;
}

export function isUsableNow(candidate: Candidate, snapshot: Snapshot): boolean {
  return candidate.availableLevel <= snapshot.level;
}

function quickerPassMatches(pass: string, candidate: Candidate, snapshot: Snapshot): boolean {
  if (pass === "easy-now") {
    return isUsableNow(candidate, snapshot) && hasEasySource(candidate.item, snapshot);
  }
  if (pass === "easy-soon") {
    return hasEasySource(candidate.item, snapshot);
  }
  if (pass === "own-profession") {
    return hasOwnProfessionCraft(candidate.item, snapshot);
  }
  return isUsableNow(candidate, snapshot);
}

export function quickerOption(best: Candidate, candidates: Candidate[], snapshot: Snapshot): Candidate | null {
  for (const pass of QUICKER_PASSES) {
    if (quickerPassMatches(pass, best, snapshot)) {
      return null;
    }
    for (const candidate of candidates) {
      if (candidate.item.name !== best.item.name && quickerPassMatches(pass, candidate, snapshot)) {
        return candidate;
      }
    }
  }
  return null;
}

function questOnlyIds(item: Item, snapshot: Snapshot): number[] | null {
  if (isBuyableOnAuctionHouse(item)) {
    return null;
  }
  const questIds: number[] = [];
  for (const source of obtainableSources(item, snapshot)) {
    if (source.type !== "quest" || source.questId === undefined) {
      return null;
    }
    questIds.push(source.questId);
  }
  return questIds;
}

function isBlockedByPartner(item: Item, snapshot: Snapshot, blocked: BlockList): boolean {
  if (blocked.names.has(item.name)) {
    return true;
  }
  const questIds = questOnlyIds(item, snapshot);
  if (questIds === null || questIds.length === 0) {
    return false;
  }
  for (const questId of questIds) {
    if (!blocked.questIds.has(questId)) {
      return false;
    }
  }
  return true;
}

function picksOf(options: UpgradeOptions): Candidate[] {
  const picks = [options.best];
  if (options.quicker !== null) {
    picks.push(options.quicker);
  }
  if (options.onTheWay !== null) {
    picks.push(options.onTheWay);
  }
  return picks;
}

function blockQuestsOf(pick: Candidate, snapshot: Snapshot, blocked: BlockList): void {
  for (const source of sourcesForCharacter(pick.item, snapshot)) {
    if (source.type === "quest" && source.questId !== undefined) {
      blocked.questIds.add(source.questId);
    }
  }
}

function blockPicks(options: UpgradeOptions, snapshot: Snapshot, blocked: BlockList): void {
  for (const pick of picksOf(options)) {
    blocked.names.add(pick.item.name);
    blockQuestsOf(pick, snapshot, blocked);
  }
}

export function blockQuestPicks(options: UpgradeOptions, snapshot: Snapshot, blocked: BlockList): void {
  for (const pick of picksOf(options)) {
    blockQuestsOf(pick, snapshot, blocked);
  }
}

export function emptyBlockList(): BlockList {
  return { names: new Set(), questIds: new Set() };
}

export function upgradeOptions(slotDefinition: SlotDefinition, snapshot: Snapshot, character: Character, blocked: BlockList): UpgradeOptions | null {
  const candidates: Candidate[] = [];
  for (const candidate of rankedCandidatesForSlot(slotDefinition, snapshot, character)) {
    if (!isBlockedByPartner(candidate.item, snapshot, blocked)) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  const best = candidates[0];
  const quicker = quickerOption(best, candidates, snapshot);
  return { slotDefinition: slotDefinition, best: best, quicker: quicker, onTheWay: onTheWayOption(best, quicker, candidates, snapshot, character), priority: best.gain };
}

function onTheWayOption(best: Candidate, quicker: Candidate | null, candidates: Candidate[], snapshot: Snapshot, character: Character): Candidate | null {
  if (!isRouteActive(character) || isFreeOnRoute(best.item, snapshot, character) || (quicker !== null && isFreeOnRoute(quicker.item, snapshot, character))) {
    return null;
  }
  for (const candidate of candidates) {
    if (candidate !== best && candidate !== quicker && isFreeOnRoute(candidate.item, snapshot, character)) {
      return candidate;
    }
  }
  return null;
}

export function pairedUpgradeOptions(slotDefinition: SlotDefinition, snapshot: Snapshot, character: Character): PairedUpgradeOptions {
  const weights = characterWeights(character);
  const keys = [slotDefinition.key, slotDefinition.pairedWith || slotDefinition.key];
  if (itemScore(snapshot.equipment[keys[1]], weights, keys[1]) < itemScore(snapshot.equipment[keys[0]], weights, keys[0])) {
    keys.reverse();
  }
  const blocked = emptyBlockList();
  const parts: UpgradeOptions[] = [];
  let priority = 0;
  for (const key of keys) {
    const definition = slotDefinitionByKey(key);
    if (definition === null) {
      continue;
    }
    const options = upgradeOptions(definition, snapshot, character, blocked);
    if (options === null) {
      continue;
    }
    parts.push(options);
    blockPicks(options, snapshot, blocked);
    priority = Math.max(priority, options.priority);
  }
  return { group: true, slotDefinition: slotDefinition, parts: parts, priority: priority };
}

export function compareUpgradeOptions(first: { priority: number }, second: { priority: number }): number {
  return second.priority - first.priority;
}

export function isUpgradeForAnySpec(item: Item, character: Character, snapshot: Snapshot): boolean {
  for (const specKey of characterSpecs(character, snapshot)) {
    const weights = weightsForSpec(character, specKey);
    const gain = bestGainAnySlot(item, snapshot, weights);
    const counts = isWorthwhileGain(gain, snapshot, weights) || (isRouteActive(character) && hasGearShare(gain, snapshot, weights, FREE_ON_PATH_GEAR_SHARE) && isFreeOnRoute(item, snapshot, character));
    if (suitsSpec(item, specKey, snapshot) && counts) {
      return true;
    }
  }
  return false;
}

export function dungeonHasUpgrades(dungeonName: string, character: Character, snapshot: Snapshot): boolean {
  for (const item of window.FOREVER_ITEMS) {
    if (canUseItem(item, snapshot) && itemDungeons(item, snapshot).has(dungeonName) && isUpgradeForAnySpec(item, character, snapshot)) {
      return true;
    }
  }
  return false;
}
