const STORAGE_KEYS = {
  credentials: "foreverPlanner.credentials",
  settings: "foreverPlanner.settings",
  snapshots: "foreverPlanner.snapshots"
};

const DEFAULT_LOOKAHEAD_LEVELS = 3;
const FUTURE_UPGRADE_WEIGHT = 0.5;
const MAX_SOURCES_SHOWN = 2;
const WOWHEAD_ITEM_URL = "https://www.wowhead.com/forever/item=";

const state = {
  credentials: null,
  settings: null,
  snapshots: {},
  accessToken: null,
  tsm: null,
  accessTokenExpiresAt: 0
};

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    setStatus("Could not save to browser storage: " + error.message, "error");
  }
}

function defaultSettings() {
  return {
    region: "eu",
    characters: [],
    selectedCharacterSlug: null,
    lookaheadLevels: DEFAULT_LOOKAHEAD_LEVELS,
    hiddenItemIds: []
  };
}

function loadState() {
  state.credentials = readStorage(STORAGE_KEYS.credentials, { clientId: "", clientSecret: "" });
  state.settings = Object.assign(defaultSettings(), readStorage(STORAGE_KEYS.settings, {}));
  state.snapshots = readStorage(STORAGE_KEYS.snapshots, {});
  moveSharedHiddenItemsToCharacters();
}

function moveSharedHiddenItemsToCharacters() {
  const sharedHiddenIds = state.settings.hiddenItemIds || [];
  if (sharedHiddenIds.length === 0) {
    return;
  }
  for (const character of state.settings.characters) {
    character.hiddenItemIds = (character.hiddenItemIds || []).concat(sharedHiddenIds);
  }
  state.settings.hiddenItemIds = [];
  saveSettings();
}

function saveSettings() {
  writeStorage(STORAGE_KEYS.settings, state.settings);
}

function saveSnapshots() {
  writeStorage(STORAGE_KEYS.snapshots, state.snapshots);
}

function setStatus(message, kind) {
  const statusLine = document.getElementById("status-line");
  statusLine.textContent = message;
  statusLine.dataset.kind = kind || "info";
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined && text !== null) {
    element.textContent = text;
  }
  return element;
}

function characterSlug(name, surname) {
  return (name + "-" + surname).toLowerCase();
}

function selectedCharacter() {
  return findCharacter(state.settings.selectedCharacterSlug);
}

async function fetchAccessToken() {
  if (state.accessToken !== null && Date.now() < state.accessTokenExpiresAt) {
    return state.accessToken;
  }
  const clientId = state.credentials.clientId;
  const clientSecret = state.credentials.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error("Add your Battle.net client ID and secret in Settings first.");
  }
  const response = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(clientId + ":" + clientSecret),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (response.status === 401) {
    throw new Error("Battle.net rejected the client ID or secret. Check them in Settings.");
  }
  if (!response.ok) {
    throw new Error("Battle.net login failed with status " + response.status + ".");
  }
  const payload = await response.json();
  state.accessToken = payload.access_token;
  state.accessTokenExpiresAt = Date.now() + (payload.expires_in - 60) * 1000;
  return state.accessToken;
}

async function fetchFromBattleNet(path, namespacePrefix) {
  const token = await fetchAccessToken();
  const region = state.settings.region;
  const url = "https://" + region + ".api.blizzard.com" + path +
    "?namespace=" + namespacePrefix + "-forever-" + region + "&locale=en_GB";
  const response = await fetch(url, { headers: { "Authorization": "Bearer " + token } });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Battle.net returned status " + response.status + " for " + path + ".");
  }
  return response.json();
}

function fetchProfile(characterSlugValue, path) {
  return fetchFromBattleNet("/profile/wow/character/" + encodeURIComponent(characterSlugValue) + path, "profile");
}

function mediaAsset(media, assetKey) {
  if (media === null) {
    return null;
  }
  for (const asset of media.assets || []) {
    if (asset.key === assetKey) {
      return asset.value;
    }
  }
  return null;
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

function compactProfessions(professions) {
  const names = [];
  if (professions === null) {
    return names;
  }
  for (const entry of (professions.primaries || []).concat(professions.secondaries || [])) {
    let skillPoints = entry.skill_points;
    if (entry.tiers && entry.tiers.length > 0) {
      skillPoints = entry.tiers[0].skill_points;
    }
    names.push({ name: entry.profession.name, skillPoints: skillPoints });
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
    fetchProfile(character.slug, "/specializations")
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
    talentSpecs: detectTalentSpecs(profile.character_class.name, results[3])
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
  if (item.faction && item.faction !== snapshot.factionType) {
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
  const takenItemId = pairedCandidates[0].item.id;
  const remaining = [];
  for (const candidate of candidates) {
    if (candidate.item.id !== takenItemId) {
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
    if (item.usableLevel > maximumLevel) {
      continue;
    }
    if (equippedIds.has(item.id) || hiddenIds.has(item.id)) {
      continue;
    }
    if (!canUseItem(item, snapshot)) {
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

function qualityClass(quality) {
  return "quality-" + String(quality || "COMMON").toLowerCase();
}

function iconUrlForItem(item) {
  if (item.iconUrl) {
    return item.iconUrl;
  }
  let iconId = window.GAME_RULES.unknownIconId;
  if (item.icon) {
    iconId = item.icon;
  }
  return "https://render.worldofwarcraft.com/forever-" + state.settings.region + "/icons/56/" + iconId + ".jpg";
}

function wowheadUrl(item) {
  return WOWHEAD_ITEM_URL + item.id;
}

function wowheadLink(item) {
  const link = createElement("a", qualityClass(item.quality), item.name);
  link.href = wowheadUrl(item);
  link.target = "_blank";
  link.rel = "noopener";
  return link;
}

function itemIcon(item, sizeClass) {
  const image = createElement("img", "item-icon " + sizeClass + " " + qualityClass(item.quality));
  image.src = iconUrlForItem(item);
  image.alt = "";
  image.loading = "lazy";
  return image;
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

function sourcesForCharacter(item, snapshot) {
  const sources = [];
  for (const source of item.sources || []) {
    if (source.faction && source.faction !== snapshot.factionType) {
      continue;
    }
    sources.push(source);
  }
  return sources;
}

function priceFor(itemId) {
  if (state.tsm === null) {
    return null;
  }
  const price = state.tsm.prices[itemId];
  if (!price) {
    return null;
  }
  let usual = price.marketValue || price.marketValueRecent || price.regionMarketValue || price.regionSale || 0;
  let buyNow = 0;
  let listed = 0;
  if (price.minBuyout && price.numAuctions) {
    buyNow = price.minBuyout;
    listed = price.numAuctions;
  }
  if (!usual && !buyNow) {
    return null;
  }
  return { buyNow: buyNow, listed: listed, usual: usual };
}

function unitCost(itemId) {
  const price = priceFor(itemId);
  if (price === null) {
    return null;
  }
  if (price.buyNow) {
    return price.buyNow;
  }
  return price.usual;
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

function formatMoney(copper) {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const copperLeft = copper % 100;
  const parts = [];
  if (gold > 0) {
    parts.push(gold + "g");
  }
  if (silver > 0) {
    parts.push(silver + "s");
  }
  if (copperLeft > 0 || parts.length === 0) {
    parts.push(copperLeft + "c");
  }
  return parts.join(" ");
}

function isListedOnAuctionHouse(item) {
  const price = priceFor(item.id);
  return price !== null && price.listed > 0;
}

function isEasySource(source, snapshot) {
  if (source.type === "quest") {
    return true;
  }
  if (source.type === "craft") {
    return hasProfession(snapshot, source.profession);
  }
  return false;
}

function hasEasySource(item, snapshot) {
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

function describeSource(source, snapshot) {
  if (source.type === "quest") {
    let text = "Quest: " + source.quest;
    if (source.zone) {
      text += " (" + source.zone + ")";
    }
    return text;
  }
  if (source.type === "craft") {
    let text = "Crafted: " + source.profession;
    if (hasProfession(snapshot, source.profession)) {
      text += " (you have it)";
    }
    return text;
  }
  return "Unknown source";
}

function levelText(item, prefix) {
  if (item.levelEstimated) {
    return "about " + prefix + item.usableLevel;
  }
  return prefix + item.usableLevel;
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

function upgradeOptions(slotDefinition, snapshot, character, takenItemIds) {
  const candidates = [];
  for (const candidate of candidatesForSlot(slotDefinition, snapshot, character)) {
    if (!takenItemIds.has(candidate.item.id)) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  const best = candidates[0];
  let quicker = null;
  for (const candidate of candidates) {
    if (candidate.item.usableLevel <= snapshot.level && hasEasySource(candidate.item, snapshot)) {
      quicker = candidate;
      break;
    }
  }
  if (quicker === null) {
    for (const candidate of candidates) {
      if (candidate.item.usableLevel <= snapshot.level) {
        quicker = candidate;
        break;
      }
    }
  }
  if (quicker !== null && quicker.item.id === best.item.id) {
    quicker = null;
  }
  let priority = best.primaryGain * FUTURE_UPGRADE_WEIGHT;
  if (best.item.usableLevel <= snapshot.level) {
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
  if (upgradeItem.usableLevel > snapshot.level) {
    subtitle += " · " + levelText(upgradeItem, "level ");
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
  let subtitle = item.itemSubclass + " · " + levelText(item, "level ");
  if (item.usableLevel <= snapshot.level) {
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
    option.appendChild(createElement("div", "option-requirement", item.reputation));
  }
  if (item.skill) {
    option.appendChild(createElement("div", "option-requirement", item.skill));
  }

  const price = priceFor(item.id);
  if (price !== null) {
    const priceParts = [];
    if (price.buyNow) {
      priceParts.push("AH now " + formatMoney(price.buyNow) + " (" + price.listed + " listed)");
    } else {
      priceParts.push("Not on the AH right now");
    }
    if (price.usual) {
      priceParts.push("usually " + formatMoney(price.usual));
    }
    option.appendChild(createElement("div", "option-price", priceParts.join(" · ")));
  }

  const sources = sourcesForCharacter(item, snapshot);
  const sourceList = createElement("ul", "sources");
  if (sources.length === 0 && price === null) {
    sourceList.appendChild(createElement("li", "muted", "Source not in Blizzard's data. Check Wowhead (drop, vendor or world item)."));
  }
  for (const source of sources.slice(0, MAX_SOURCES_SHOWN)) {
    const entry = createElement("li", null, describeSource(source, snapshot));
    if (source.type === "craft" && source.reagents.length > 0) {
      const reagentTexts = [];
      for (const reagent of source.reagents) {
        reagentTexts.push(reagent.quantity + "× " + reagent.name);
      }
      entry.appendChild(createElement("div", "muted", reagentTexts.join(", ")));
      if (state.tsm !== null) {
        const cost = materialCost(source);
        let costText = "Materials on the AH: " + formatMoney(cost.total);
        if (cost.missing > 0) {
          costText += " (" + cost.missing + " without a price)";
        }
        entry.appendChild(createElement("div", "option-price", costText));
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

  const characterRender = document.getElementById("character-render");
  characterRender.setAttribute("aria-label", character.displayName);
  if (snapshot.render) {
    characterRender.style.backgroundImage = "url(\"" + snapshot.render + "\")";
    characterRender.classList.remove("render-missing");
  } else {
    characterRender.style.backgroundImage = "";
    characterRender.classList.add("render-missing");
  }

  const optionsBySlot = {};
  const allOptions = [];
  const takenItemIds = new Set();
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    if (slotDefinition.cosmetic) {
      continue;
    }
    const options = upgradeOptions(slotDefinition, snapshot, character, takenItemIds);
    if (options === null) {
      continue;
    }
    optionsBySlot[slotDefinition.key] = options;
    allOptions.push(options);
    if (slotDefinition.pairedWith) {
      takenItemIds.add(options.best.item.id);
      if (options.quicker !== null) {
        takenItemIds.add(options.quicker.item.id);
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
  document.getElementById("tsm-status").textContent = tsmStatusText();
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

async function readConnectedTsmPrices(askPermission) {
  const handle = await window.TSM.loadFileHandle();
  if (handle === null) {
    state.tsm = null;
    return;
  }
  let permission = await handle.queryPermission({ mode: "read" });
  if (permission !== "granted" && askPermission) {
    permission = await handle.requestPermission({ mode: "read" });
  }
  if (permission !== "granted") {
    state.tsm = null;
    return;
  }
  let rulesetName = "";
  let factionName = "";
  const character = selectedCharacter();
  if (character !== null && state.snapshots[character.slug]) {
    rulesetName = state.snapshots[character.slug].ruleset;
    factionName = state.snapshots[character.slug].faction;
  }
  state.tsm = await window.TSM.readPrices(handle, rulesetName, factionName);
}

function tsmStatusText() {
  if (state.tsm === null) {
    return "Not connected.";
  }
  let scopeText = "region prices only";
  if (state.tsm.scope !== null) {
    scopeText = state.tsm.scope + " auction house and region prices";
  }
  return "Connected: " + scopeText + ", from TSM data of " + new Date(state.tsm.downloadedAt).toLocaleString() + ".";
}

async function handleTsmConnectClick() {
  if (!window.showOpenFilePicker) {
    setStatus("This browser can't read local files. Use Chrome.", "error");
    return;
  }
  try {
    const handles = await window.showOpenFilePicker({
      types: [{ description: "TSM AppData.lua", accept: { "text/plain": [".lua"] } }]
    });
    await window.TSM.storeFileHandle(handles[0]);
    await readConnectedTsmPrices(true);
    document.getElementById("tsm-status").textContent = tsmStatusText();
    render();
  } catch (error) {
    if (error.name !== "AbortError") {
      setStatus(error.message, "error");
    }
  }
}

async function handleTsmDisconnectClick() {
  await window.TSM.forgetFileHandle();
  state.tsm = null;
  document.getElementById("tsm-status").textContent = tsmStatusText();
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
    await readConnectedTsmPrices(true);
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    refreshButton.disabled = false;
  }
}

function findCharacter(slug) {
  for (const character of state.settings.characters) {
    if (character.slug === slug) {
      return character;
    }
  }
  return null;
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
  document.getElementById("tsm-connect-button").addEventListener("click", handleTsmConnectClick);
  document.getElementById("tsm-disconnect-button").addEventListener("click", handleTsmDisconnectClick);
  document.getElementById("import-input").addEventListener("change", handleImportChange);
  document.getElementById("character-select").addEventListener("change", handleCharacterSelectChange);
  document.getElementById("priority-list").addEventListener("click", handlePriorityListClick);
  document.getElementById("character-list").addEventListener("click", handleCharacterListClick);
  document.getElementById("play-controls").addEventListener("change", handlePlayControlsChange);
  document.getElementById("hidden-items").addEventListener("click", handleHiddenItemsClick);
}

function handleTsmStartupError(error) {
  setStatus("Could not read TSM prices: " + error.message, "error");
}

function start() {
  loadState();
  bindEvents();
  if (!window.FOREVER_ITEMS) {
    setStatus("Game data is missing (web/data/items.js). Pull the latest version of the planner.", "error");
    return;
  }
  render();
  readConnectedTsmPrices(false).then(render).catch(handleTsmStartupError);
  if (state.settings.characters.length === 0) {
    setStatus("Open Settings to add your API client and a character.", "info");
  }
}

start();
