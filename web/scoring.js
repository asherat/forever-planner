const MAIN_STATS = ["STRENGTH", "AGILITY", "INTELLECT", "ATTACK_POWER", "RANGED_ATTACK_POWER", "SPELL_POWER", "SPELL_HEALING_DONE"];

function specForTalentTree(className, treeName) {
  const classSpecKeys = window.GAME_RULES.classSpecs[className] || [];
  for (const specKey of classSpecKeys) {
    if (window.GAME_RULES.specs[specKey].talentTree === treeName) {
      return specKey;
    }
  }
  return null;
}

function mainTreeOfGroup(group) {
  let bestTree = null;
  let bestPoints = 0;
  for (const specialization of group.specializations || []) {
    if (specialization.spent_points > bestPoints) {
      bestPoints = specialization.spent_points;
      bestTree = specialization.specialization_name;
    }
  }
  return bestTree;
}

function detectTalentSpecs(className, specializations) {
  const detected = [];
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

function compareActiveGroupFirst(first, second) {
  return Number(Boolean(second.is_active)) - Number(Boolean(first.is_active));
}

function characterSpecs(character, snapshot) {
  let specs = snapshot.talentSpecs || [];
  if (specs.length === 0) {
    const classSpecKeys = window.GAME_RULES.classSpecs[snapshot.className] || ["druid-feral-cat"];
    specs = [classSpecKeys[0]];
  }
  const resolved = [];
  for (const specKey of specs) {
    if (specKey === window.GAME_RULES.feralSpecs.cat && character.feralForm === "bear") {
      resolved.push(window.GAME_RULES.feralSpecs.bear);
    } else {
      resolved.push(specKey);
    }
  }
  return resolved;
}

function hasFeralSpec(snapshot) {
  return (snapshot.talentSpecs || []).indexOf(window.GAME_RULES.feralSpecs.cat) !== -1;
}

function characterPlaystyle(character) {
  if (character.playstyle && window.GAME_RULES.playstyles[character.playstyle]) {
    return character.playstyle;
  }
  return window.GAME_RULES.defaultPlaystyle;
}

function activeSpec(character) {
  const specs = characterSpecs(character, state.snapshots[character.slug]);
  if (character.gearFor === "off" && specs.length > 1) {
    return specs[1];
  }
  return specs[0];
}

function isPvpRuleset(snapshot) {
  return snapshot.ruleset === window.GAME_RULES.pvpRuleset;
}

function specPreset(specKey) {
  return window.GAME_RULES.specPresets[window.GAME_RULES.specs[specKey].preset];
}

function mainStatWeight(weights) {
  let strongest = 0;
  for (const statKey of MAIN_STATS) {
    strongest = Math.max(strongest, weights[statKey] || 0);
  }
  return strongest;
}

function characterWeights(character) {
  return weightsForSpec(character, activeSpec(character));
}

function weightsForSpec(character, specKey) {
  const playstyle = window.GAME_RULES.playstyles[characterPlaystyle(character)];
  const weights = Object.assign({}, specPreset(specKey).weights);
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

function isRangedWeapon(item) {
  return item.slot === "RANGED" || item.slot === "RANGEDRIGHT" || item.slot === "THROWN";
}

function weaponDamageWeight(item, weights, slotKey) {
  if (isRangedWeapon(item)) {
    return weights.RANGED_DPS || 0;
  }
  if (slotKey === "OFF_HAND" || item.slot === "WEAPONOFFHAND") {
    return weights.OFF_HAND_DPS || 0;
  }
  return weights.MAIN_HAND_DPS || 0;
}

function itemArmor(item) {
  if (item.armor !== undefined) {
    return item.armor;
  }
  const known = itemById(item.id);
  if (known === null) {
    return 0;
  }
  return known.armor || 0;
}

function itemScore(item, weights, slotKey) {
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

function itemWithSuffix(item, suffix) {
  const stats = Object.assign({}, item.stats);
  for (const statKey of Object.keys(suffix.stats)) {
    stats[statKey] = (stats[statKey] || 0) + suffix.stats[statKey];
  }
  return Object.assign({}, item, { name: item.name + " " + suffix.name, stats: stats, suffix: suffix });
}

function bestSuffixVariant(item, weights, slotKey) {
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

function canUseItem(item, snapshot) {
  const proficiencies = window.GAME_RULES.classProficiencies[snapshot.className];
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

function weaponProficiency(proficiencies, item) {
  if (item.slot === "TWOHWEAPON") {
    return proficiencies.twoHand;
  }
  if (item.slot === "RANGED" || item.slot === "RANGEDRIGHT" || item.slot === "THROWN") {
    return proficiencies.ranged;
  }
  if (item.slot === "WEAPONOFFHAND" && !proficiencies.dualWield) {
    return [];
  }
  return proficiencies.oneHand;
}

function isTwoHanded(item) {
  return item !== null && item !== undefined && item.slot === "TWOHWEAPON";
}

function slotItemTypes(slotDefinition, snapshot) {
  const types = slotDefinition.itemSlots.slice();
  const proficiencies = window.GAME_RULES.classProficiencies[snapshot.className];
  if (slotDefinition.key === "OFF_HAND" && proficiencies && proficiencies.dualWield) {
    types.push("WEAPON", "WEAPONOFFHAND");
  }
  return types;
}

function comparisonBaseline(slotDefinition, snapshot, item, weights) {
  const equipment = snapshot.equipment;
  if (slotDefinition.key === "MAIN_HAND" && isTwoHanded(item)) {
    return itemScore(equipment.MAIN_HAND, weights, "MAIN_HAND") + itemScore(equipment.OFF_HAND, weights, "OFF_HAND");
  }
  return itemScore(equipment[slotDefinition.key], weights, slotDefinition.key);
}

function slotDefinitionByKey(slotKey) {
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    if (slotDefinition.key === slotKey) {
      return slotDefinition;
    }
  }
  return null;
}

function bestGainAnySlot(item, snapshot, weights) {
  let best = 0;
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
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

function specLabel(specKey) {
  return window.GAME_RULES.specs[specKey].label;
}
