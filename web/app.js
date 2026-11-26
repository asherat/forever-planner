const FUTURE_UPGRADE_WEIGHT = 0.5;
const MAX_SOURCES_SHOWN = 4;
const NEUTRAL_REPUTATION_TIER = 3;
const REPUTATION_TIERS_WITHIN_REACH = 1;
const REPUTATION_TIER_NAMES = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"];
const CREATURE_RANKS = { 1: "elite", 2: "rare elite", 3: "boss", 4: "rare" };

function fetchProfile(characterSlugValue, path) {
  return fetchFromBattleNet("/profile/wow/character/" + encodeURIComponent(characterSlugValue) + path, "profile");
}

async function fetchItemIcon(itemId) {
  const media = await fetchFromBattleNet("/data/wow/media/item/" + itemId, "static");
  return mediaAsset(media, "icon");
}

async function addEquipmentIcons(equippedBySlot) {
  const slotKeys = Object.keys(equippedBySlot);
  const iconRequests = [];
  for (const slotKey of slotKeys) {
    iconRequests.push(fetchItemIcon(equippedBySlot[slotKey].id));
  }
  const icons = await Promise.all(iconRequests);
  for (let index = 0; index < slotKeys.length; index += 1) {
    equippedBySlot[slotKeys[index]].iconUrl = icons[index];
  }
}

function compactEquipment(equipment) {
  const equippedBySlot = {};
  if (equipment === null) {
    return equippedBySlot;
  }
  for (const equippedItem of equipment.equipped_items || []) {
    const stats = {};
    for (const stat of equippedItem.stats || []) {
      if (stat.type) {
        stats[stat.type.type] = stat.value;
      }
    }
    for (const spell of equippedItem.spells || []) {
      const match = /\+(\d+) Attack Power in Cat, Bear, and Dire Bear forms only/.exec(spell.description || "");
      if (match !== null) {
        stats.FERAL_ATTACK_POWER = (stats.FERAL_ATTACK_POWER || 0) + Number(match[1]);
      }
    }
    const record = {
      id: equippedItem.item.id,
      name: equippedItem.name,
      quality: equippedItem.quality.type,
      slot: equippedItem.inventory_type.type,
      stats: stats,
      itemSubclass: "",
      effects: [],
      enchantments: []
    };
    if (equippedItem.item_subclass) {
      record.itemSubclass = equippedItem.item_subclass.name;
    }
    for (const spell of equippedItem.spells || []) {
      if (spell.description) {
        record.effects.push(spell.description);
      }
    }
    if (equippedItem.weapon) {
      record.weapon = { damagePerSecond: 0 };
      if (equippedItem.weapon.dps) {
        record.weapon.damagePerSecond = equippedItem.weapon.dps.value;
      }
    }
    for (const enchantment of equippedItem.enchantments || []) {
      record.enchantments.push(enchantment.display_string);
    }
    equippedBySlot[equippedItem.slot.type] = record;
  }
  return equippedBySlot;
}

function compactReputations(reputations) {
  const tiers = {};
  if (reputations === null) {
    return tiers;
  }
  for (const entry of reputations.reputations || []) {
    tiers[entry.faction.id] = entry.standing.tier;
  }
  return tiers;
}

function reputationTier(snapshot, factionId) {
  if (snapshot.reputations && snapshot.reputations[factionId] !== undefined) {
    return snapshot.reputations[factionId];
  }
  return NEUTRAL_REPUTATION_TIER;
}

function meetsReputation(item, snapshot) {
  if (!item.reputationRequirement) {
    return true;
  }
  return reputationTier(snapshot, item.reputationRequirement.factionId) >= item.reputationRequirement.tier;
}

function isReputationWithinReach(item, snapshot) {
  if (!item.reputationRequirement) {
    return true;
  }
  return reputationTier(snapshot, item.reputationRequirement.factionId) >= item.reputationRequirement.tier - REPUTATION_TIERS_WITHIN_REACH;
}

function reputationRequirementText(item, snapshot) {
  const current = REPUTATION_TIER_NAMES[reputationTier(snapshot, item.reputationRequirement.factionId)];
  if (meetsReputation(item, snapshot)) {
    return item.reputation + " (you have it)";
  }
  return item.reputation + " (you're " + current + ")";
}

function compactProfessions(professions) {
  const names = [];
  if (professions === null) {
    return names;
  }
  for (const entry of (professions.primaries || []).concat(professions.secondaries || [])) {
    let skillPoints = entry.skill_points;
    const recipeIds = [];
    for (const tier of entry.tiers || []) {
      skillPoints = tier.skill_points;
      for (const recipe of tier.known_recipes || []) {
        recipeIds.push(recipe.id);
      }
    }
    names.push({ name: entry.profession.name, skillPoints: skillPoints, recipeIds: recipeIds });
  }
  return names;
}

async function refreshCharacter(character) {
  setStatus("Fetching " + character.displayName + " from Battle.net…", "info");
  const profile = await fetchProfile(character.slug, "");
  if (profile === null) {
    throw new Error(character.displayName + " was not found. Characters appear from level 10, after logging out.");
  }
  const results = await Promise.all([
    fetchProfile(character.slug, "/equipment"),
    fetchProfile(character.slug, "/professions"),
    fetchProfile(character.slug, "/character-media"),
    fetchProfile(character.slug, "/specializations"),
    fetchProfile(character.slug, "/reputations")
  ]);
  const equippedBySlot = compactEquipment(results[0]);
  await addEquipmentIcons(equippedBySlot);
  let rulesetName = "";
  if (profile.ruleset) {
    rulesetName = profile.ruleset.name;
  }
  state.snapshots[character.slug] = {
    fetchedAt: new Date().toISOString(),
    lastLogout: profile.last_login_timestamp,
    level: profile.level,
    className: profile.character_class.name,
    raceName: profile.race.name,
    faction: profile.faction.name,
    factionType: profile.faction.type,
    ruleset: rulesetName,
    equipment: equippedBySlot,
    professions: compactProfessions(results[1]),
    avatar: mediaAsset(results[2], "avatar"),
    render: mediaAsset(results[2], "main-raw"),
    talentSpecs: detectTalentSpecs(profile.character_class.name, results[3]),
    reputations: compactReputations(results[4])
  };
  saveSnapshots();
  setStatus("Updated from your last logout (" + new Date(profile.last_login_timestamp).toLocaleString() + ").", "success");
}

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

function activeSpecs(character) {
  return characterSpecs(character, state.snapshots[character.slug]);
}

function specWeights(specKey, playstyle) {
  const presetKey = window.GAME_RULES.specs[specKey].preset;
  const weights = Object.assign({}, window.GAME_RULES.specPresets[presetKey].weights);
  const multipliers = window.GAME_RULES.playstyles[playstyle].multipliers;
  for (const statKey of Object.keys(multipliers)) {
    if (weights[statKey]) {
      weights[statKey] = weights[statKey] * multipliers[statKey];
    }
  }
  return weights;
}

function itemScore(item, weights) {
  if (item === null || item === undefined) {
    return 0;
  }
  let score = 0;
  for (const statKey of Object.keys(item.stats || {})) {
    if (weights[statKey]) {
      score += item.stats[statKey] * weights[statKey];
    }
  }
  if (item.weapon && weights.WEAPON_DPS) {
    score += item.weapon.damagePerSecond * weights.WEAPON_DPS;
  }
  return Math.round(score * 10) / 10;
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
    return proficiencies.weapons.indexOf(item.itemSubclass) !== -1;
  }
  return false;
}

function isTwoHanded(item) {
  return item !== null && item !== undefined && item.slot === "TWOHWEAPON";
}

function slotItemTypes(slotDefinition, snapshot) {
  const types = slotDefinition.itemSlots.slice();
  const proficiencies = window.GAME_RULES.classProficiencies[snapshot.className];
  if (slotDefinition.key === "OFF_HAND" && proficiencies && proficiencies.dualWield) {
    types.push("WEAPON");
  }
  return types;
}

function comparisonBaseline(slotDefinition, snapshot, item, weights) {
  const equipment = snapshot.equipment;
  if (slotDefinition.pairedWith) {
    const ownScore = itemScore(equipment[slotDefinition.key], weights);
    const pairedScore = itemScore(equipment[slotDefinition.pairedWith], weights);
    return Math.min(ownScore, pairedScore);
  }
  if (slotDefinition.key === "MAIN_HAND" && isTwoHanded(item)) {
    return itemScore(equipment.MAIN_HAND, weights) + itemScore(equipment.OFF_HAND, weights);
  }
  return itemScore(equipment[slotDefinition.key], weights);
}

function candidatesForSlot(slotDefinition, snapshot, character) {
  const candidates = rankedCandidatesForSlot(slotDefinition, snapshot, character);
  if (slotDefinition.pairedWith === undefined || slotDefinition.key.endsWith("_1")) {
    return candidates;
  }
  const pairedDefinition = slotDefinitionByKey(slotDefinition.pairedWith);
  const pairedCandidates = rankedCandidatesForSlot(pairedDefinition, snapshot, character);
  if (pairedCandidates.length === 0) {
    return candidates;
  }
  const takenItemName = pairedCandidates[0].item.name;
  const remaining = [];
  for (const candidate of candidates) {
    if (candidate.item.name !== takenItemName) {
      remaining.push(candidate);
    }
  }
  return remaining;
}

function slotDefinitionByKey(slotKey) {
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    if (slotDefinition.key === slotKey) {
      return slotDefinition;
    }
  }
  return null;
}

function rankedCandidatesForSlot(slotDefinition, snapshot, character) {
  const equipment = snapshot.equipment;
  if (slotDefinition.key === "OFF_HAND" && isTwoHanded(equipment.MAIN_HAND)) {
    return [];
  }
  const itemTypes = slotItemTypes(slotDefinition, snapshot);
  const maximumLevel = snapshot.level + Number(state.settings.lookaheadLevels);
  const specs = activeSpecs(character);
  const playstyle = characterPlaystyle(character);
  const primaryWeights = specWeights(specs[0], playstyle);
  let secondaryWeights = null;
  if (specs.length > 1) {
    secondaryWeights = specWeights(specs[1], playstyle);
  }
  const equippedIds = new Set();
  for (const slotKey of Object.keys(equipment)) {
    equippedIds.add(equipment[slotKey].id);
  }
  const hiddenIds = new Set(character.hiddenItemIds || []);
  const candidates = [];
  for (const item of window.FOREVER_ITEMS) {
    if (itemTypes.indexOf(item.slot) === -1) {
      continue;
    }
    if (itemUsableLevel(item, snapshot) > maximumLevel) {
      continue;
    }
    if (equippedIds.has(item.id) || hiddenIds.has(item.id)) {
      continue;
    }
    if (!canUseItem(item, snapshot)) {
      continue;
    }
    if (!isReputationWithinReach(item, snapshot)) {
      continue;
    }
    const primaryGain = itemScore(item, primaryWeights) - comparisonBaseline(slotDefinition, snapshot, item, primaryWeights);
    if (primaryGain <= 0) {
      continue;
    }
    let secondaryGain = 0;
    if (secondaryWeights !== null) {
      secondaryGain = itemScore(item, secondaryWeights) - comparisonBaseline(slotDefinition, snapshot, item, secondaryWeights);
    }
    candidates.push({
      item: item,
      primaryGain: Math.round(primaryGain * 10) / 10,
      secondaryGain: Math.round(secondaryGain * 10) / 10
    });
  }
  candidates.sort(compareCandidates);
  return candidates;
}

function compareCandidates(first, second) {
  return second.primaryGain - first.primaryGain;
}

function gainBadge(value, label) {
  const badge = createElement("span", "gain");
  if (value > 0) {
    badge.classList.add("gain-positive");
    badge.textContent = label + " +" + value;
  } else if (value < 0) {
    badge.classList.add("gain-negative");
    badge.textContent = label + " " + value;
  } else {
    badge.textContent = label + " ±0";
  }
  return badge;
}

function gainBadges(candidate, character) {
  const gains = createElement("div", "gains");
  const specs = activeSpecs(character);
  gains.appendChild(gainBadge(candidate.primaryGain, specLabel(specs[0])));
  if (specs.length > 1) {
    gains.appendChild(gainBadge(candidate.secondaryGain, specLabel(specs[1])));
  }
  return gains;
}

function specLabel(specKey) {
  return window.GAME_RULES.specs[specKey].label;
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
  for (const quest of detail.quests) {
    if (quest.faction === null || quest.faction === snapshot.factionType) {
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

function sourcesForCharacter(item, snapshot) {
  const sources = [];
  const detail = questieDetail(item);
  const questLevels = {};
  const listedQuestIds = new Set();
  if (detail !== null) {
    for (const quest of questieQuestsForCharacter(detail, snapshot)) {
      questLevels[quest.id] = quest;
    }
  }
  for (const source of item.sources || []) {
    if (source.faction && source.faction !== snapshot.factionType) {
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
  for (const source of detail.sources) {
    if (source.type === "vendor" && source.friendlyTo && source.friendlyTo.indexOf(ownLetter) === -1) {
      continue;
    }
    sources.push(source);
  }
  return sources;
}

function materialCost(source) {
  let total = 0;
  let missing = 0;
  for (const reagent of source.reagents) {
    const cost = unitCost(reagent.id);
    if (cost === null) {
      missing += 1;
    } else {
      total += cost * reagent.quantity;
    }
  }
  return { total: total, missing: missing };
}

function unknownSourceText() {
  if (state.questie === null) {
    return "Connect your WoW folder in Settings to see where this comes from, or check Wowhead.";
  }
  return "No known source. Often a PvP rank or reputation reward; check Wowhead.";
}

function isListedOnAuctionHouse(item) {
  const price = priceFor(item.id);
  return price !== null && price.listed > 0;
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
  if (source.type === "quest" || source.type === "vendor") {
    return true;
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
  if (isListedOnAuctionHouse(item)) {
    return true;
  }
  for (const source of sourcesForCharacter(item, snapshot)) {
    if (isEasySource(source, snapshot)) {
      return true;
    }
  }
  return false;
}

function joinDetails(parts) {
  const filled = [];
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

function creatureRankText(rank) {
  return CREATURE_RANKS[rank] || "";
}

function creatureLevelText(source) {
  if (!source.minLevel) {
    return "";
  }
  if (source.maxLevel && source.maxLevel !== source.minLevel) {
    return "level " + source.minLevel + "-" + source.maxLevel;
  }
  return "level " + source.minLevel;
}

function describeSource(source, snapshot) {
  if (source.type === "quest") {
    let levelPart = "";
    if (source.level) {
      levelPart = "level " + source.level;
    }
    return "Quest: " + source.quest + joinDetails([levelPart, source.zone]);
  }
  if (source.type === "vendor") {
    let name = "Vendor: " + source.npc;
    if (source.title) {
      name += ", " + source.title;
    }
    return name + joinDetails([source.zone]);
  }
  if (source.type === "drop") {
    return "Drops from " + source.npc + joinDetails([creatureLevelText(source), creatureRankText(source.rank), source.zone]);
  }
  if (source.type === "more-drops") {
    return "…and " + source.count + " more creatures";
  }
  if (source.type === "world-drop") {
    return "World drop (" + source.count + " creatures can drop it)";
  }
  if (source.type === "object") {
    return "Found in " + source.name + joinDetails([source.zone]);
  }
  if (source.type === "craft") {
    let text = "Crafted: " + source.profession;
    if (knowsRecipe(snapshot, source)) {
      text += " (you know the recipe)";
    } else if (hasProfession(snapshot, source.profession)) {
      text += " (you have the profession, not the recipe yet)";
    }
    return text;
  }
  return "Unknown source";
}

function levelText(item, snapshot, prefix) {
  const level = itemUsableLevel(item, snapshot);
  if (isLevelEstimated(item, snapshot)) {
    return "about " + prefix + level;
  }
  return prefix + level;
}

function statLabel(statKey) {
  const label = window.GAME_RULES.statLabels[statKey];
  if (label) {
    return label;
  }
  const words = statKey.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function statSummary(item) {
  const parts = [];
  for (const statKey of Object.keys(item.stats || {})) {
    const label = statLabel(statKey);
    parts.push("+" + item.stats[statKey] + " " + label);
  }
  if (item.weapon) {
    parts.push(item.weapon.damagePerSecond.toFixed(1) + " DPS");
  }
  return parts.join(", ");
}

function upgradeOptions(slotDefinition, snapshot, character, takenItemNames) {
  const candidates = [];
  for (const candidate of candidatesForSlot(slotDefinition, snapshot, character)) {
    if (!takenItemNames.has(candidate.item.name)) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  const best = candidates[0];
  let quicker = null;
  for (const candidate of candidates) {
    if (itemUsableLevel(candidate.item, snapshot) <= snapshot.level && hasEasySource(candidate.item, snapshot)) {
      quicker = candidate;
      break;
    }
  }
  if (quicker === null) {
    for (const candidate of candidates) {
      if (itemUsableLevel(candidate.item, snapshot) <= snapshot.level) {
        quicker = candidate;
        break;
      }
    }
  }
  if (quicker !== null && quicker.item.id === best.item.id) {
    quicker = null;
  }
  let priority = best.primaryGain * FUTURE_UPGRADE_WEIGHT;
  if (itemUsableLevel(best.item, snapshot) <= snapshot.level) {
    priority = best.primaryGain;
  }
  if (quicker !== null && quicker.primaryGain > priority) {
    priority = quicker.primaryGain;
  }
  return { slotDefinition: slotDefinition, best: best, quicker: quicker, priority: priority };
}

function compareUpgradeOptions(first, second) {
  return second.priority - first.priority;
}

function renderTooltip(lines) {
  const tooltip = createElement("span", "tooltip");
  for (const line of lines) {
    tooltip.appendChild(createElement("span", null, line));
  }
  return tooltip;
}

function tooltipHeader(tooltip, item, subtitle) {
  tooltip.appendChild(createElement("span", "tooltip-title " + qualityClass(item.quality), item.name));
  tooltip.appendChild(createElement("span", "tooltip-subtitle", subtitle));
}

function tooltipLine(tooltip, className, text) {
  tooltip.appendChild(createElement("span", "tooltip-line " + className, text));
}

function weaponDamagePerSecond(item) {
  if (item && item.weapon) {
    return item.weapon.damagePerSecond;
  }
  return 0;
}

function renderItemTooltip(item, slotLabel) {
  const tooltip = createElement("span", "tooltip");
  let subtitle = slotLabel;
  if (item.itemSubclass) {
    subtitle = slotLabel + " · " + item.itemSubclass;
  }
  tooltipHeader(tooltip, item, subtitle);
  if (item.weapon) {
    tooltipLine(tooltip, "", item.weapon.damagePerSecond.toFixed(1) + " damage per second");
  }
  for (const statKey of Object.keys(item.stats || {})) {
    tooltipLine(tooltip, "", "+" + item.stats[statKey] + " " + statLabel(statKey));
  }
  for (const effect of item.effects || []) {
    tooltipLine(tooltip, "tooltip-effect", effect);
  }
  for (const enchantment of item.enchantments || []) {
    tooltipLine(tooltip, "tooltip-enchant", enchantment);
  }
  return tooltip;
}

function comparedItems(slotDefinition, snapshot, upgradeItem) {
  const items = [];
  const equipped = snapshot.equipment[slotDefinition.key];
  if (equipped) {
    items.push(equipped);
  }
  if (slotDefinition.key === "MAIN_HAND" && isTwoHanded(upgradeItem) && snapshot.equipment.OFF_HAND) {
    items.push(snapshot.equipment.OFF_HAND);
  }
  return items;
}

function summedStats(items) {
  const totals = {};
  for (const item of items) {
    for (const statKey of Object.keys(item.stats || {})) {
      totals[statKey] = (totals[statKey] || 0) + item.stats[statKey];
    }
  }
  return totals;
}

function differenceText(difference) {
  if (difference > 0) {
    return " (+" + difference + ")";
  }
  if (difference < 0) {
    return " (" + difference + ")";
  }
  return "";
}

function differenceClass(difference) {
  if (difference > 0) {
    return "tooltip-better";
  }
  if (difference < 0) {
    return "tooltip-worse";
  }
  return "";
}

function specsUseWeaponDamage(character) {
  for (const specKey of activeSpecs(character)) {
    if (specWeights(specKey, characterPlaystyle(character)).WEAPON_DPS) {
      return true;
    }
  }
  return false;
}

function renderComparisonTooltip(slotDefinition, snapshot, character, candidate) {
  const upgradeItem = candidate.item;
  const tooltip = createElement("span", "tooltip tooltip-comparison");
  let subtitle = slotDefinition.label;
  if (upgradeItem.itemSubclass) {
    subtitle = slotDefinition.label + " · " + upgradeItem.itemSubclass;
  }
  if (itemUsableLevel(upgradeItem, snapshot) > snapshot.level) {
    subtitle += " · " + levelText(upgradeItem, snapshot, "level ");
  }
  tooltipHeader(tooltip, upgradeItem, subtitle);

  const currentItems = comparedItems(slotDefinition, snapshot, upgradeItem);
  const currentStats = summedStats(currentItems);
  const upgradeStats = upgradeItem.stats || {};

  const newDamage = weaponDamagePerSecond(upgradeItem);
  if (newDamage > 0) {
    let currentDamage = 0;
    if (currentItems.length > 0) {
      currentDamage = weaponDamagePerSecond(currentItems[0]);
    }
    const damageDifference = Math.round((newDamage - currentDamage) * 10) / 10;
    let damageClass = differenceClass(damageDifference);
    let damageText = newDamage.toFixed(1) + " damage per second" + differenceText(damageDifference);
    if (!specsUseWeaponDamage(character)) {
      damageClass = "tooltip-irrelevant";
      damageText += ", not used by your specs";
    }
    tooltipLine(tooltip, damageClass, damageText);
  }
  for (const statKey of Object.keys(upgradeStats)) {
    const difference = upgradeStats[statKey] - (currentStats[statKey] || 0);
    tooltipLine(tooltip, differenceClass(difference), "+" + upgradeStats[statKey] + " " + statLabel(statKey) + differenceText(difference));
  }
  for (const statKey of Object.keys(currentStats)) {
    if (upgradeStats[statKey] === undefined) {
      tooltipLine(tooltip, "tooltip-worse", "−" + currentStats[statKey] + " " + statLabel(statKey) + " (lost)");
    }
  }
  for (const effect of upgradeItem.effects || []) {
    tooltipLine(tooltip, "tooltip-effect", effect);
  }

  return tooltip;
}

function renderSlot(slotDefinition, snapshot, character, optionsBySlot) {
  const slot = createElement("div", "slot slot-" + slotDefinition.column);
  const equipped = snapshot.equipment[slotDefinition.key];

  const equippedLink = createElement("a", "slot-equipped");
  if (equipped) {
    equippedLink.href = wowheadUrl(equipped);
    equippedLink.target = "_blank";
    equippedLink.rel = "noopener";
    equippedLink.appendChild(itemIcon(equipped, "icon-large"));
    equippedLink.appendChild(renderItemTooltip(equipped, slotDefinition.label));
    equippedLink.setAttribute("aria-label", slotDefinition.label + ": " + equipped.name);
  } else {
    equippedLink.appendChild(createElement("span", "item-icon icon-large icon-empty"));
    equippedLink.appendChild(renderTooltip([slotDefinition.label, "Empty"]));
    equippedLink.setAttribute("aria-label", slotDefinition.label + ": empty");
  }
  slot.appendChild(equippedLink);

  const options = optionsBySlot[slotDefinition.key];
  if (options) {
    const upgrade = options.best;
    const upgradeLink = createElement("a", "slot-upgrade");
    upgradeLink.href = "#upgrade-" + slotDefinition.key;
    upgradeLink.appendChild(itemIcon(upgrade.item, "icon-small"));
    upgradeLink.appendChild(createElement("span", "upgrade-marker", "▲"));
    upgradeLink.appendChild(renderComparisonTooltip(slotDefinition, snapshot, character, upgrade));
    upgradeLink.setAttribute("aria-label", slotDefinition.label + " upgrade: " + upgrade.item.name);
    slot.appendChild(upgradeLink);
  }
  return slot;
}

function renderOption(label, candidate, snapshot, character, slotDefinition) {
  const item = candidate.item;
  const option = createElement("div", "option");
  option.appendChild(createElement("div", "option-label", label));

  const heading = createElement("div", "option-heading");
  heading.appendChild(itemIcon(item, "icon-medium"));
  const title = createElement("div", "option-title");
  title.appendChild(wowheadLink(item));
  let subtitle = item.itemSubclass + " · " + levelText(item, snapshot, "level ");
  if (itemUsableLevel(item, snapshot) <= snapshot.level) {
    subtitle = item.itemSubclass + " · usable now";
  }
  title.appendChild(createElement("span", "muted", subtitle));
  heading.appendChild(title);
  heading.appendChild(renderComparisonTooltip(slotDefinition, snapshot, character, candidate));
  heading.tabIndex = 0;
  option.appendChild(heading);

  option.appendChild(gainBadges(candidate, character));
  option.appendChild(createElement("div", "option-stats", statSummary(item)));
  for (const effect of item.effects || []) {
    option.appendChild(createElement("div", "option-effect", effect));
  }
  if (item.reputation) {
    let requirementClass = "option-requirement";
    let requirementText = item.reputation;
    if (item.reputationRequirement) {
      requirementText = reputationRequirementText(item, snapshot);
      if (meetsReputation(item, snapshot)) {
        requirementClass = "option-requirement-met";
      }
    }
    option.appendChild(createElement("div", requirementClass, requirementText));
  }
  if (item.skill) {
    option.appendChild(createElement("div", "option-requirement", item.skill));
  }

  const price = priceFor(item.id);
  if (price !== null) {
    const priceLine = createElement("div", "option-price");
    if (price.buyNow) {
      priceLine.append("AH now ", renderMoney(price.buyNow), " (" + price.listed + " listed)");
    } else {
      priceLine.append("Not on the AH right now");
    }
    if (price.usual) {
      priceLine.append(" · usually ", renderMoney(price.usual));
    }
    option.appendChild(priceLine);
  }

  const sources = sourcesForCharacter(item, snapshot);
  const sourceList = createElement("ul", "sources");
  if (sources.length === 0 && price === null) {
    sourceList.appendChild(createElement("li", "muted", unknownSourceText()));
  }
  for (const source of sources.slice(0, MAX_SOURCES_SHOWN)) {
    const entry = createElement("li", null, describeSource(source, snapshot));
    if (source.type === "craft" && source.reagents.length > 0) {
      const reagentTexts = [];
      for (const reagent of source.reagents) {
        reagentTexts.push(reagent.quantity + "× " + reagent.name);
      }
      entry.appendChild(createElement("div", "muted", reagentTexts.join(", ")));
      const craftingLink = createElement("a", "crafting-link", "Open in crafting tool");
      craftingLink.href = "crafting.html#add=" + item.id;
      entry.appendChild(craftingLink);
      if (state.tsm !== null) {
        const cost = materialCost(source);
        const costLine = createElement("div", "option-price");
        costLine.append("Materials on the AH: ", renderMoney(cost.total));
        if (cost.missing > 0) {
          costLine.append(" (" + cost.missing + " without a price)");
        }
        entry.appendChild(costLine);
      }
    }
    sourceList.appendChild(entry);
  }
  if (sources.length > MAX_SOURCES_SHOWN) {
    sourceList.appendChild(createElement("li", "muted", (sources.length - MAX_SOURCES_SHOWN) + " more sources on Wowhead"));
  }
  option.appendChild(sourceList);

  const hideButton = createElement("button", "link", "Not interested");
  hideButton.type = "button";
  hideButton.dataset.hideItemId = String(item.id);
  option.appendChild(hideButton);
  return option;
}

function renderPriority(options, snapshot, character) {
  const slotDefinition = options.slotDefinition;
  const entry = createElement("li", "priority");
  entry.id = "upgrade-" + slotDefinition.key;

  const heading = createElement("h3", "priority-heading");
  heading.appendChild(createElement("span", null, slotDefinition.label));
  const equipped = snapshot.equipment[slotDefinition.key];
  if (equipped) {
    const current = createElement("span", "priority-current muted");
    current.appendChild(document.createTextNode("now "));
    current.appendChild(wowheadLink(equipped));
    heading.appendChild(current);
  }
  entry.appendChild(heading);

  const optionRow = createElement("div", "option-row");
  optionRow.appendChild(renderOption("Best upgrade", options.best, snapshot, character, slotDefinition));
  if (options.quicker !== null) {
    optionRow.appendChild(renderOption("Quicker option", options.quicker, snapshot, character, slotDefinition));
  }
  entry.appendChild(optionRow);
  return entry;
}

function hideItem(itemId) {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  if (!character.hiddenItemIds) {
    character.hiddenItemIds = [];
  }
  if (character.hiddenItemIds.indexOf(itemId) === -1) {
    character.hiddenItemIds.push(itemId);
    saveSettings();
  }
  render();
}

function restoreItem(itemId) {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  const remaining = [];
  for (const hiddenId of character.hiddenItemIds || []) {
    if (hiddenId !== itemId) {
      remaining.push(hiddenId);
    }
  }
  character.hiddenItemIds = remaining;
  saveSettings();
  render();
}

function renderCharacterSelect() {
  const select = document.getElementById("character-select");
  select.replaceChildren();
  for (const character of state.settings.characters) {
    const option = createElement("option", null, character.displayName);
    option.value = character.slug;
    option.selected = character.slug === state.settings.selectedCharacterSlug;
    select.appendChild(option);
  }
  select.hidden = state.settings.characters.length === 0;
}

function render() {
  renderCharacterSelect();
  const character = selectedCharacter();
  const welcome = document.getElementById("welcome");
  const armory = document.getElementById("armory");
  const priorities = document.getElementById("priorities");
  let snapshot = null;
  if (character !== null) {
    snapshot = state.snapshots[character.slug] || null;
  }
  if (character === null || snapshot === null) {
    welcome.hidden = false;
    armory.hidden = true;
    priorities.hidden = true;
    if (character !== null) {
      setStatus("Press Refresh to load " + character.displayName + ".", "info");
    }
    return;
  }
  welcome.hidden = true;
  armory.hidden = false;
  priorities.hidden = false;

  document.getElementById("character-name").textContent = character.displayName;
  document.getElementById("character-meta").textContent =
    "Level " + snapshot.level + " " + snapshot.raceName + " " + snapshot.className + " · " + snapshot.faction +
    " · " + snapshot.ruleset;
  const specs = activeSpecs(character);
  const specNames = [];
  for (const specKey of specs) {
    specNames.push(specLabel(specKey));
  }
  document.getElementById("character-specs").textContent =
    "Comparing for " + specNames.join(" and ") +
    " · gear as of your logout on " + new Date(snapshot.lastLogout).toLocaleString();

  document.getElementById("paperdoll").dataset.faction = String(snapshot.factionType || "").toLowerCase();
  const characterRender = document.getElementById("character-render");
  characterRender.setAttribute("aria-label", character.displayName);
  if (snapshot.render) {
    characterRender.style.setProperty("--render-image", "url(\"" + snapshot.render + "\")");
    characterRender.classList.remove("render-missing");
  } else {
    characterRender.style.removeProperty("--render-image");
    characterRender.classList.add("render-missing");
  }

  const optionsBySlot = {};
  const allOptions = [];
  const takenItemNames = new Set();
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    if (slotDefinition.cosmetic) {
      continue;
    }
    const options = upgradeOptions(slotDefinition, snapshot, character, takenItemNames);
    if (options === null) {
      continue;
    }
    optionsBySlot[slotDefinition.key] = options;
    allOptions.push(options);
    if (slotDefinition.pairedWith) {
      takenItemNames.add(options.best.item.name);
      if (options.quicker !== null) {
        takenItemNames.add(options.quicker.item.name);
      }
    }
  }

  const columns = {
    left: document.getElementById("slots-left"),
    right: document.getElementById("slots-right"),
    bottom: document.getElementById("slots-bottom")
  };
  for (const columnKey of Object.keys(columns)) {
    columns[columnKey].replaceChildren();
  }
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    columns[slotDefinition.column].appendChild(renderSlot(slotDefinition, snapshot, character, optionsBySlot));
  }

  document.getElementById("lookahead-label").textContent = String(state.settings.lookaheadLevels);
  renderPlayControls(character, snapshot);
  renderHiddenItems(character);
  allOptions.sort(compareUpgradeOptions);
  const priorityList = document.getElementById("priority-list");
  priorityList.replaceChildren();
  for (const options of allOptions) {
    priorityList.appendChild(renderPriority(options, snapshot, character));
  }
}

function renderCharacterList() {
  const list = document.getElementById("character-list");
  list.replaceChildren();
  for (const character of state.settings.characters) {
    const row = createElement("div", "character-row");
    row.appendChild(createElement("span", "character-row-name", character.displayName));
    const snapshot = state.snapshots[character.slug];
    let summary = "Press Refresh to load";
    if (snapshot) {
      const specNames = [];
      for (const specKey of characterSpecs(character, snapshot)) {
        specNames.push(specLabel(specKey));
      }
      summary = "Level " + snapshot.level + " " + snapshot.className + " · " + specNames.join(" / ");
    }
    row.appendChild(createElement("span", "muted", summary));
    const removeButton = createElement("button", "link", "Remove");
    removeButton.type = "button";
    removeButton.dataset.removeCharacterSlug = character.slug;
    row.appendChild(removeButton);
    list.appendChild(row);
  }
}

function renderChoiceGroup(container, name, choices, selectedValue) {
  container.replaceChildren();
  for (const choice of choices) {
    const label = createElement("label", "choice");
    const input = createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = choice.value;
    input.checked = choice.value === selectedValue;
    label.appendChild(input);
    label.appendChild(createElement("span", null, choice.label));
    container.appendChild(label);
  }
}

function renderPlayControls(character, snapshot) {
  const playstyleChoices = [];
  for (const playstyleKey of Object.keys(window.GAME_RULES.playstyles)) {
    playstyleChoices.push({ value: playstyleKey, label: window.GAME_RULES.playstyles[playstyleKey].label });
  }
  renderChoiceGroup(document.getElementById("playstyle-choices"), "playstyle", playstyleChoices, characterPlaystyle(character));
  const feralGroup = document.getElementById("feral-form");
  feralGroup.hidden = !hasFeralSpec(snapshot);
  let feralForm = "cat";
  if (character.feralForm === "bear") {
    feralForm = "bear";
  }
  renderChoiceGroup(document.getElementById("feral-form-choices"), "feral-form",
    [{ value: "cat", label: "Cat" }, { value: "bear", label: "Bear" }], feralForm);
}

function renderHiddenItems(character) {
  const container = document.getElementById("hidden-items");
  const list = document.getElementById("hidden-item-list");
  list.replaceChildren();
  const hiddenIds = character.hiddenItemIds || [];
  container.hidden = hiddenIds.length === 0;
  for (const itemId of hiddenIds) {
    const item = itemById(itemId);
    const entry = createElement("li", "hidden-item");
    if (item !== null) {
      entry.appendChild(itemIcon(item, "icon-small"));
      entry.appendChild(wowheadLink(item));
    } else {
      entry.appendChild(createElement("span", null, "Item " + itemId));
    }
    const restoreButton = createElement("button", "link", "Bring back");
    restoreButton.type = "button";
    restoreButton.dataset.restoreItemId = String(itemId);
    entry.appendChild(restoreButton);
    list.appendChild(entry);
  }
}

function itemById(itemId) {
  for (const item of window.FOREVER_ITEMS) {
    if (item.id === itemId) {
      return item;
    }
  }
  return null;
}

function removeCharacter(slug) {
  const remaining = [];
  for (const character of state.settings.characters) {
    if (character.slug !== slug) {
      remaining.push(character);
    }
  }
  state.settings.characters = remaining;
  delete state.snapshots[slug];
  if (state.settings.selectedCharacterSlug === slug) {
    state.settings.selectedCharacterSlug = null;
    if (remaining.length > 0) {
      state.settings.selectedCharacterSlug = remaining[0].slug;
    }
  }
  saveSettings();
  saveSnapshots();
  renderCharacterList();
  render();
}

function addCharacter() {
  const nameInput = document.getElementById("new-character-name");
  const surnameInput = document.getElementById("new-character-surname");
  const name = nameInput.value.trim();
  const surname = surnameInput.value.trim();
  if (!name || !surname) {
    setStatus("Enter both the first name and the surname.", "error");
    return;
  }
  const slug = characterSlug(name, surname);
  for (const character of state.settings.characters) {
    if (character.slug === slug) {
      setStatus(name + " " + surname + " is already in your list.", "error");
      return;
    }
  }
  state.settings.characters.push({ slug: slug, displayName: name + " " + surname, hiddenItemIds: [] });
  state.settings.selectedCharacterSlug = slug;
  nameInput.value = "";
  surnameInput.value = "";
  saveSettings();
  renderCharacterList();
  render();
}

function openSettings() {
  document.getElementById("client-id-input").value = state.credentials.clientId;
  document.getElementById("client-secret-input").value = state.credentials.clientSecret;
  document.getElementById("region-select").value = state.settings.region;
  document.getElementById("lookahead-input").value = String(state.settings.lookaheadLevels);
  renderFolderStatus();
  renderCharacterList();
  document.getElementById("settings-dialog").showModal();
}

function closeSettings() {
  const clientId = document.getElementById("client-id-input").value.trim();
  const clientSecret = document.getElementById("client-secret-input").value.trim();
  if (clientId !== state.credentials.clientId || clientSecret !== state.credentials.clientSecret) {
    state.accessToken = null;
  }
  state.credentials = { clientId: clientId, clientSecret: clientSecret };
  writeStorage(STORAGE_KEYS.credentials, state.credentials);
  state.settings.region = document.getElementById("region-select").value;
  state.settings.lookaheadLevels = Number(document.getElementById("lookahead-input").value) || 0;
  saveSettings();
  render();
}

function exportSettings() {
  const blob = new Blob([JSON.stringify(state.settings, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "forever-planner-settings.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function handleSettingsFileLoaded(event) {
  try {
    const imported = JSON.parse(String(event.target.result));
    state.settings = Object.assign(defaultSettings(), imported);
    saveSettings();
    renderCharacterList();
    render();
    setStatus("Settings loaded.", "success");
  } catch (error) {
    setStatus("That file is not a valid settings file.", "error");
  }
}

function importSettings(file) {
  const reader = new FileReader();
  reader.addEventListener("load", handleSettingsFileLoaded);
  reader.readAsText(file);
}

function questieItemIds() {
  const itemIds = [];
  for (const item of window.FOREVER_ITEMS) {
    itemIds.push(item.id);
  }
  return itemIds;
}

function renderFolderStatus() {
  const folderStatus = document.getElementById("wow-folder-status");
  if (!state.wowFolderConnected) {
    folderStatus.textContent = "Not connected.";
    if (state.tsm !== null) {
      folderStatus.textContent = "Not connected. TSM prices still come from the AppData.lua file you picked earlier.";
    }
  } else {
    folderStatus.textContent = "Connected.";
  }
  document.getElementById("questie-status").textContent = questieStatusText();
  document.getElementById("tsm-status").textContent = tsmStatusText();
  document.getElementById("inventory-status").textContent = inventoryStatusText();
}

async function handleWowFolderConnectClick() {
  if (!window.showDirectoryPicker) {
    setStatus("This browser can't read local folders. Use Chrome.", "error");
    return;
  }
  try {
    const folder = await window.showDirectoryPicker({ id: "wow-folder", mode: "read" });
    if ((await window.WOW_FOLDER.addonsDirectory(folder)) === null) {
      setStatus("That folder has no Interface/AddOns inside. Pick your World of Warcraft or _forever_ folder.", "error");
      return;
    }
    await window.WOW_FOLDER.storeHandle(window.WOW_FOLDER.folderKey, folder);
    await window.WOW_FOLDER.forgetHandle(window.WOW_FOLDER.legacyTsmFileKey);
    setStatus("Reading Questie and TSM data…", "info");
    await readWowFolder(true);
    renderFolderStatus();
    setStatus("WoW folder connected.", "success");
    render();
  } catch (error) {
    if (error.name !== "AbortError") {
      setStatus(error.message, "error");
    }
  }
}

async function handleWowFolderDisconnectClick() {
  await window.WOW_FOLDER.forgetHandle(window.WOW_FOLDER.folderKey);
  await window.WOW_FOLDER.forgetHandle(window.WOW_FOLDER.legacyTsmFileKey);
  state.tsm = null;
  state.questie = null;
  state.wowFolderConnected = false;
  renderFolderStatus();
  render();
}

async function handleRefreshClick() {
  const character = selectedCharacter();
  if (character === null) {
    setStatus("Add a character in Settings first.", "error");
    return;
  }
  const refreshButton = document.getElementById("refresh-button");
  refreshButton.disabled = true;
  try {
    await refreshCharacter(character);
    await readWowFolder(true);
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    refreshButton.disabled = false;
  }
}

function handlePriorityListClick(event) {
  const itemId = event.target.dataset.hideItemId;
  if (itemId !== undefined) {
    hideItem(Number(itemId));
  }
}

function handleCharacterListClick(event) {
  const slug = event.target.dataset.removeCharacterSlug;
  if (slug !== undefined) {
    removeCharacter(slug);
  }
}

function handlePlayControlsChange(event) {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  if (event.target.name === "playstyle") {
    character.playstyle = event.target.value;
  }
  if (event.target.name === "feral-form") {
    character.feralForm = event.target.value;
  }
  saveSettings();
  render();
}

function handleHiddenItemsClick(event) {
  const itemId = event.target.dataset.restoreItemId;
  if (itemId !== undefined) {
    restoreItem(Number(itemId));
  }
}

function handleImportChange(event) {
  if (event.target.files.length > 0) {
    importSettings(event.target.files[0]);
  }
}

function handleCharacterSelectChange(event) {
  state.settings.selectedCharacterSlug = event.target.value;
  saveSettings();
  render();
}

function bindEvents() {
  document.getElementById("refresh-button").addEventListener("click", handleRefreshClick);
  document.getElementById("settings-button").addEventListener("click", openSettings);
  document.getElementById("settings-dialog").addEventListener("close", closeSettings);
  document.getElementById("add-character-button").addEventListener("click", addCharacter);
  document.getElementById("export-button").addEventListener("click", exportSettings);
  document.getElementById("wow-folder-connect-button").addEventListener("click", handleWowFolderConnectClick);
  document.getElementById("wow-folder-disconnect-button").addEventListener("click", handleWowFolderDisconnectClick);
  document.getElementById("import-input").addEventListener("change", handleImportChange);
  document.getElementById("character-select").addEventListener("change", handleCharacterSelectChange);
  document.getElementById("priority-list").addEventListener("click", handlePriorityListClick);
  document.getElementById("character-list").addEventListener("click", handleCharacterListClick);
  document.getElementById("play-controls").addEventListener("change", handlePlayControlsChange);
  document.getElementById("hidden-items").addEventListener("click", handleHiddenItemsClick);
}

function handleTsmStartupError(error) {
  setStatus("Could not read your WoW folder: " + error.message, "error");
}

function start() {
  loadState();
  bindEvents();
  if (!window.FOREVER_ITEMS) {
    setStatus("Game data is missing (web/data/items.js). Pull the latest version of the planner.", "error");
    return;
  }
  render();
  readWowFolder(false).then(render).catch(handleTsmStartupError);
  if (state.settings.characters.length === 0) {
    setStatus("Open Settings to add your API client and a character.", "info");
  }
}

start();
