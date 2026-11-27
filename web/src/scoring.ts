import "./legacy.ts";
import { itemById, itemFaction } from "./sources.ts";
import type { Character, Item, Proficiencies, RandomSuffix, SlotDefinition, Snapshot, TalentSpecializations, Weights } from "./types.ts";
import { state } from "./state.ts";

type TalentGroup = NonNullable<TalentSpecializations["specialization_groups"]>[number];

const MAIN_STATS = ["STRENGTH", "AGILITY", "INTELLECT", "ATTACK_POWER", "RANGED_ATTACK_POWER", "SPELL_POWER", "SPELL_HEALING_DONE"];

function rules() {
  return window.GAME_RULES;
}

function specForTalentTree(className: string, treeName: string | null): string | null {
  for (const specKey of rules().classSpecs[className] || []) {
    if (rules().specs[specKey].talentTree === treeName) {
      return specKey;
    }
  }
  return null;
}

function mainTreeOfGroup(group: TalentGroup): string | null {
  let bestTree: string | null = null;
  let bestPoints = 0;
  for (const specialization of group.specializations || []) {
    if (specialization.spent_points > bestPoints) {
      bestPoints = specialization.spent_points;
      bestTree = specialization.specialization_name;
    }
  }
  return bestTree;
}

function compareActiveGroupFirst(first: TalentGroup, second: TalentGroup): number {
  return Number(Boolean(second.is_active)) - Number(Boolean(first.is_active));
}

export function detectTalentSpecs(className: string, specializations: TalentSpecializations | null): string[] {
  const detected: string[] = [];
  if (specializations === null) {
    return detected;
  }
  const groups = (specializations.specialization_groups || []).slice();
  groups.sort(compareActiveGroupFirst);
  for (const group of groups) {
    const specKey = specForTalentTree(className, mainTreeOfGroup(group));
    if (specKey !== null && detected.indexOf(specKey) === -1) {
      detected.push(specKey);
    }
  }
  return detected;
}

export function characterSpecs(character: Character, snapshot: Snapshot): string[] {
  let specs = snapshot.talentSpecs || [];
  if (specs.length === 0) {
    const classSpecKeys = rules().classSpecs[snapshot.className] || ["druid-feral-cat"];
    specs = [classSpecKeys[0]];
  }
  const resolved: string[] = [];
  for (const specKey of specs) {
    if (specKey === rules().feralSpecs.cat && character.feralForm === "bear") {
      resolved.push(rules().feralSpecs.bear);
    } else {
      resolved.push(specKey);
    }
  }
  return resolved;
}

export function hasFeralSpec(snapshot: Snapshot): boolean {
  return (snapshot.talentSpecs || []).indexOf(rules().feralSpecs.cat) !== -1;
}

export function characterPlaystyle(character: Character): string {
  if (character.playstyle && rules().playstyles[character.playstyle]) {
    return character.playstyle;
  }
  return rules().defaultPlaystyle;
}

export function activeSpec(character: Character): string {
  const specs = characterSpecs(character, state.snapshots[character.slug]);
  if (character.gearFor === "off" && specs.length > 1) {
    return specs[1];
  }
  return specs[0];
}

export function isPvpRuleset(snapshot: Snapshot): boolean {
  return snapshot.ruleset === rules().pvpRuleset;
}

export function specPreset(specKey: string) {
  return rules().specPresets[rules().specs[specKey].preset];
}

function mainStatWeight(weights: Weights): number {
  let strongest = 0;
  for (const statKey of MAIN_STATS) {
    strongest = Math.max(strongest, weights[statKey] || 0);
  }
  return strongest;
}

export function weightsForSpec(character: Character, specKey: string): Weights {
  const playstyle = rules().playstyles[characterPlaystyle(character)];
  const weights: Weights = Object.assign({}, specPreset(specKey).weights);
  for (const statKey of Object.keys(playstyle.multipliers)) {
    if (weights[statKey]) {
      weights[statKey] = weights[statKey] * playstyle.multipliers[statKey];
    }
  }
  if (playstyle.pvpRulesetStaminaShare && isPvpRuleset(state.snapshots[character.slug])) {
    weights.STAMINA = Math.max(weights.STAMINA || 0, playstyle.pvpRulesetStaminaShare * mainStatWeight(weights));
  }
  return weights;
}

export function characterWeights(character: Character): Weights {
  return weightsForSpec(character, activeSpec(character));
}

export function isRangedWeapon(item: Item): boolean {
  return item.slot === "RANGED" || item.slot === "RANGEDRIGHT" || item.slot === "THROWN";
}

export function weaponDamageWeight(item: Item, weights: Weights, slotKey: string): number {
  if (isRangedWeapon(item)) {
    return weights.RANGED_DPS || 0;
  }
  if (slotKey === "OFF_HAND" || item.slot === "WEAPONOFFHAND") {
    return weights.OFF_HAND_DPS || 0;
  }
  return weights.MAIN_HAND_DPS || 0;
}

function itemArmor(item: Item): number {
  if (item.armor !== undefined) {
    return item.armor;
  }
  const known = itemById(item.id);
  if (known === null) {
    return 0;
  }
  return known.armor || 0;
}

export function itemScore(item: Item | null | undefined, weights: Weights, slotKey: string): number {
  if (item === null || item === undefined) {
    return 0;
  }
  let score = 0;
  for (const statKey of Object.keys(item.stats || {})) {
    if (weights[statKey]) {
      score += item.stats[statKey] * weights[statKey];
    }
  }
  if (item.weapon) {
    score += item.weapon.damagePerSecond * weaponDamageWeight(item, weights, slotKey);
  }
  if (weights.ARMOR) {
    score += itemArmor(item) * weights.ARMOR;
  }
  return Math.round(score * 10) / 10;
}

export function itemWithSuffix(item: Item, suffix: RandomSuffix): Item {
  const stats = Object.assign({}, item.stats);
  for (const statKey of Object.keys(suffix.stats)) {
    stats[statKey] = (stats[statKey] || 0) + suffix.stats[statKey];
  }
  return Object.assign({}, item, { name: item.name + " " + suffix.name, stats: stats, suffix: suffix });
}

export function bestSuffixVariant(item: Item, weights: Weights, slotKey: string): Item {
  if (!item.randomSuffixes) {
    return item;
  }
  let best = item;
  let bestScore = itemScore(item, weights, slotKey);
  for (const suffix of item.randomSuffixes) {
    const variant = itemWithSuffix(item, suffix);
    const score = itemScore(variant, weights, slotKey);
    if (score > bestScore) {
      best = variant;
      bestScore = score;
    }
  }
  return best;
}

function weaponProficiency(proficiencies: Proficiencies, item: Item): string[] {
  if (item.slot === "TWOHWEAPON") {
    return proficiencies.twoHand;
  }
  if (isRangedWeapon(item)) {
    return proficiencies.ranged;
  }
  if (item.slot === "WEAPONOFFHAND" && !proficiencies.dualWield) {
    return [];
  }
  return proficiencies.oneHand;
}

export function canUseItem(item: Item, snapshot: Snapshot): boolean {
  const proficiencies = rules().classProficiencies[snapshot.className];
  if (item.classes && item.classes.indexOf(snapshot.className) === -1) {
    return false;
  }
  const faction = itemFaction(item);
  if (faction !== null && faction !== snapshot.factionType) {
    return false;
  }
  if (!proficiencies) {
    return true;
  }
  if (item.slot === "CLOAK" || item.slot === "NECK" || item.slot === "FINGER" || item.slot === "TRINKET") {
    return true;
  }
  if (item.itemClass === "Armor") {
    return proficiencies.armor.indexOf(item.itemSubclass) !== -1;
  }
  if (item.itemClass === "Weapon") {
    return weaponProficiency(proficiencies, item).indexOf(item.itemSubclass) !== -1;
  }
  return false;
}

const ARMOR_TYPES = ["Cloth", "Leather", "Mail", "Plate"];

export function suitsSpec(item: Item, specKey: string): boolean {
  const armorTypes = rules().specs[specKey].armorTypes;
  if (!armorTypes || item.slot === "CLOAK" || ARMOR_TYPES.indexOf(item.itemSubclass) === -1) {
    return true;
  }
  return armorTypes.indexOf(item.itemSubclass) !== -1;
}

export function isTwoHanded(item: Item | null | undefined): boolean {
  return item !== null && item !== undefined && item.slot === "TWOHWEAPON";
}

export function slotItemTypes(slotDefinition: SlotDefinition, snapshot: Snapshot): string[] {
  const types = slotDefinition.itemSlots.slice();
  const proficiencies = rules().classProficiencies[snapshot.className];
  if (slotDefinition.key === "OFF_HAND" && proficiencies && proficiencies.dualWield) {
    types.push("WEAPON", "WEAPONOFFHAND");
  }
  return types;
}

export function comparisonBaseline(slotDefinition: SlotDefinition, snapshot: Snapshot, item: Item, weights: Weights): number {
  const equipment = snapshot.equipment;
  if (slotDefinition.key === "MAIN_HAND" && isTwoHanded(item)) {
    return itemScore(equipment.MAIN_HAND, weights, "MAIN_HAND") + itemScore(equipment.OFF_HAND, weights, "OFF_HAND");
  }
  return itemScore(equipment[slotDefinition.key], weights, slotDefinition.key);
}

export function slotDefinitionByKey(slotKey: string): SlotDefinition | null {
  for (const slotDefinition of rules().equipmentSlots) {
    if (slotDefinition.key === slotKey) {
      return slotDefinition;
    }
  }
  return null;
}

export function bestGainAnySlot(item: Item, snapshot: Snapshot, weights: Weights): number {
  let best = 0;
  for (const slotDefinition of rules().equipmentSlots) {
    if (slotDefinition.cosmetic || slotItemTypes(slotDefinition, snapshot).indexOf(item.slot) === -1) {
      continue;
    }
    if (slotDefinition.key === "OFF_HAND" && isTwoHanded(snapshot.equipment.MAIN_HAND)) {
      continue;
    }
    const variant = bestSuffixVariant(item, weights, slotDefinition.key);
    const gain = itemScore(variant, weights, slotDefinition.key) - comparisonBaseline(slotDefinition, snapshot, variant, weights);
    best = Math.max(best, gain);
  }
  return best;
}

export function specLabel(specKey: string): string {
  return rules().specs[specKey].label;
}
