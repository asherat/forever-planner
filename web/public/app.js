const MAX_SOURCES_SHOWN = 2;
const AVAILABLE_STEPS_SHOWN = 2;
const WOWHEAD_TOOLTIP_URL = "https://nether.wowhead.com/forever/tooltip/item/";
const MAX_TOOLTIP_CHECKS_PER_RUN = 60;
const TOOLTIP_CHECK_BATCH = 4;
const TOOLTIP_CHECKS_PER_SLOT = 5;
const TOOLTIP_CACHE_DAYS = 14;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const tooltipChecks = { pending: new Set(), running: false };
const CREATURE_RANKS = { 1: "elite", 2: "rare elite", 3: "boss", 4: "rare" };

function fetchProfile(characterSlugValue, path) {
  return fetchFromBattleNet("/profile/wow/character/" + encodeURIComponent(characterSlugValue) + path, "profile");
}

async function fetchItemIcon(itemId) {
  try {
    const media = await fetchFromBattleNet("/data/wow/media/item/" + itemId, "static");
    return mediaAsset(media, "icon");
  } catch (error) {
    return null;
  }
}

async function addEquipmentIcons(equippedBySlot) {
  const slotKeys = Object.keys(equippedBySlot);
  const iconRequests = [];
  for (const slotKey of slotKeys) {
    const known = itemById(equippedBySlot[slotKey].id);
    if (known !== null && known.icon) {
      equippedBySlot[slotKey].icon = known.icon;
      iconRequests.push(null);
    } else {
      iconRequests.push(fetchItemIcon(equippedBySlot[slotKey].id));
    }
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
      armor: 0,
      slot: equippedItem.inventory_type.type,
      stats: stats,
      itemSubclass: "",
      effects: [],
      enchantments: []
    };
    if (equippedItem.item_subclass) {
      record.itemSubclass = equippedItem.item_subclass.name;
    }
    if (equippedItem.armor) {
      record.armor = equippedItem.armor.value;
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

function compactCompletedQuests(completed) {
  const questIds = [];
  if (completed === null) {
    return questIds;
  }
  for (const quest of completed.quests || []) {
    questIds.push(quest.id);
  }
  return questIds;
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

function isTooltipLookupFresh(itemId) {
  const looked = state.tooltipRequirements[itemId];
  if (!looked) {
    return false;
  }
  let maximumAge = TOOLTIP_CACHE_DAYS * DAY_IN_MILLISECONDS;
  if (looked.failed) {
    maximumAge = DAY_IN_MILLISECONDS;
  }
  return Date.now() - (looked.checkedAt || 0) < maximumAge;
}

function queueTooltipChecks(candidates, snapshot) {
  for (const candidate of candidates.slice(0, TOOLTIP_CHECKS_PER_SLOT)) {
    if (needsTooltipCheck(candidate.item, snapshot)) {
      tooltipChecks.pending.add(candidate.item.id);
    }
  }
}

function needsTooltipCheck(item, snapshot) {
  if (item.reputationRequirement || isTooltipLookupFresh(item.id)) {
    return false;
  }
  for (const source of sourcesForCharacter(item, snapshot)) {
    if (source.type === "vendor") {
      return true;
    }
  }
  return false;
}

function parseTooltipRequirements(tooltipHtml) {
  const text = tooltipHtml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const requirements = [];
  const pattern = /Requires ([A-Z][A-Za-z' -]+?) - (Hated|Hostile|Unfriendly|Neutral|Friendly|Honored|Revered|Exalted)/g;
  let match = pattern.exec(text);
  while (match !== null) {
    const faction = window.FOREVER_REPUTATIONS[match[1]];
    if (faction) {
      requirements.push({
        factionId: faction.id,
        side: faction.side,
        tier: REPUTATION_TIER_NAMES.indexOf(match[2]),
        text: "Requires " + match[1] + " - " + match[2]
      });
    }
    match = pattern.exec(text);
  }
  return requirements;
}

async function lookUpTooltipRequirement(itemId) {
  try {
    const response = await fetch(WOWHEAD_TOOLTIP_URL + itemId + "?locale=0");
    if (!response.ok) {
      state.tooltipRequirements[itemId] = { reputations: [], failed: true, checkedAt: Date.now() };
      return;
    }
    const tooltip = await response.json();
    state.tooltipRequirements[itemId] = { reputations: parseTooltipRequirements(tooltip.tooltip || ""), checkedAt: Date.now() };
  } catch (error) {
    state.tooltipRequirements[itemId] = { reputations: [], failed: true, checkedAt: Date.now() };
  }
}

async function runTooltipChecks() {
  if (tooltipChecks.running || tooltipChecks.pending.size === 0) {
    return;
  }
  tooltipChecks.running = true;
  const itemIds = Array.from(tooltipChecks.pending).slice(0, MAX_TOOLTIP_CHECKS_PER_RUN);
  tooltipChecks.pending.clear();
  for (let start = 0; start < itemIds.length; start += TOOLTIP_CHECK_BATCH) {
    const batch = [];
    for (const itemId of itemIds.slice(start, start + TOOLTIP_CHECK_BATCH)) {
      batch.push(lookUpTooltipRequirement(itemId));
    }
    await Promise.all(batch);
  }
  writeStorage(STORAGE_KEYS.tooltipRequirements, state.tooltipRequirements);
  tooltipChecks.running = false;
  render();
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
    fetchProfile(character.slug, "/reputations"),
    fetchProfile(character.slug, "/quests/completed")
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
    reputations: compactReputations(results[4]),
    completedQuestIds: compactCompletedQuests(results[5])
  };
  saveSnapshots();
  setStatus("Updated from your last logout (" + new Date(profile.last_login_timestamp).toLocaleString() + ").", "success");
}

function gainBadge(value, label, unit) {
  const badge = createElement("span", "gain");
  if (value > 0) {
    badge.classList.add("gain-positive");
    badge.textContent = label + " +" + value + " " + unit;
  } else if (value < 0) {
    badge.classList.add("gain-negative");
    badge.textContent = label + " " + value + " " + unit;
  } else {
    badge.textContent = label + " ±0";
  }
  return badge;
}

function gainBadges(candidate, character) {
  const gains = createElement("div", "gains");
  gains.appendChild(gainBadge(candidate.gain, specLabel(activeSpec(character)), specPreset(activeSpec(character)).unit));
  return gains;
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

function renderSourceLine(source) {
  const line = createElement("li");
  if (source.type === "quest") {
    let levelPart = "";
    if (source.level) {
      levelPart = "level " + source.level;
    }
    line.append("Quest: ");
    line.appendChild(wowheadPageLink("quest", source.questId, source.quest));
    line.append(joinDetails([levelPart, source.zone]));
    return line;
  }
  if (source.type === "vendor") {
    line.append("Vendor: ");
    line.appendChild(wowheadPageLink("npc", source.npcId, source.npc));
    if (source.title) {
      line.append(", " + source.title);
    }
    line.append(joinDetails([source.zone]));
    return line;
  }
  if (source.type === "drop") {
    line.append("Drops from ");
    line.appendChild(wowheadPageLink("npc", source.npcId, source.npc));
    line.append(joinDetails([creatureLevelText(source), creatureRankText(source.rank), source.zone]));
    return line;
  }
  line.textContent = describeSource(source);
  return line;
}

function describeSource(source) {
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
    return "Crafted: " + source.profession;
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

function usesWeaponDamage(character, item, slotKey) {
  return weaponDamageWeight(item, characterWeights(character), slotKey) > 0;
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
    if (!usesWeaponDamage(character, upgradeItem, slotDefinition.key)) {
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
    equippedLink.setAttribute("role", "img");
    equippedLink.tabIndex = 0;
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
  if (candidate.availableLevel > itemUsableLevel(item, snapshot)) {
    subtitle = item.itemSubclass + " · from level " + candidate.availableLevel;
  }
  if (candidate.availableLevel <= snapshot.level) {
    subtitle = item.itemSubclass + " · usable now";
  }
  title.appendChild(createElement("span", "muted", subtitle));
  heading.appendChild(title);
  heading.appendChild(renderComparisonTooltip(slotDefinition, snapshot, character, candidate));
  heading.tabIndex = 0;
  option.appendChild(heading);

  option.appendChild(gainBadges(candidate, character));
  if (item.suffix) {
    option.appendChild(createElement("div", "option-note", "Comes with random stats. Best for you: " + item.suffix.name + "."));
  }
  if (candidate.routeLeg && candidate.routeLeg.dungeon) {
    option.appendChild(createElement("div", "route-badge tier-grey", "Dungeon: " + candidate.routeLeg.zone + ", from level " + candidate.routeLeg.fromLevel));
  } else if (candidate.routeLeg) {
    const zone = guideZone(candidate.routeLeg.zone);
    let tierClass = "tier-grey";
    if (zone !== null) {
      tierClass = TIER_COLORS[zone.tier];
    }
    option.appendChild(createElement("div", "route-badge " + tierClass, "On your path: " + candidate.routeLeg.zone + " (" + candidate.routeLeg.fromLevel + "–" + candidate.routeLeg.toLevel + ")"));
  }
  if (itemReputationRequirement(item, snapshot) !== null && !meetsReputation(item, snapshot)) {
    option.appendChild(createElement("div", "option-requirement", reputationRequirementText(item, snapshot)));
  }

  const sources = sourcesForCharacter(item, snapshot);
  const sourceList = createElement("ul", "sources");
  for (const source of sources.slice(0, MAX_SOURCES_SHOWN)) {
    const line = renderSourceLine(source);
    setSourceMapTarget(line, source);
    sourceList.appendChild(line);
  }
  if (sources.length > MAX_SOURCES_SHOWN) {
    sourceList.appendChild(createElement("li", "muted", "+" + (sources.length - MAX_SOURCES_SHOWN) + " more"));
  }
  option.appendChild(sourceList);

  const craftSource = firstCraftSource(sources);
  const prices = renderOptionPrices(item, craftSource, snapshot, candidate.gain, specPreset(activeSpec(character)).unit);
  if (prices !== null) {
    option.appendChild(prices);
  }

  const actions = createElement("div", "option-actions");
  const questSource = firstQuestSource(sources);
  if (questSource !== null && !isInQuestList(character, questSource.questId)) {
    const questButton = createElement("button", "link", "Add quest");
    questButton.type = "button";
    questButton.dataset.questAdd = String(questSource.questId);
    questButton.dataset.questItem = String(item.id);
    actions.appendChild(questButton);
  }
  if (craftSource !== null) {
    const cartButton = createElement("button", "link", "Add to crafting list");
    cartButton.type = "button";
    cartButton.dataset.cartAdd = String(item.id);
    actions.appendChild(cartButton);
  }
  const hideButton = createElement("button", "link", "Not interested");
  hideButton.type = "button";
  hideButton.dataset.hideItemId = String(item.id);
  actions.appendChild(hideButton);
  for (const dungeonName of itemDungeons(item, snapshot)) {
    const skipButton = createElement("button", "link", "Skip " + dungeonName);
    skipButton.type = "button";
    skipButton.dataset.skipDungeon = dungeonName;
    actions.appendChild(skipButton);
  }
  option.appendChild(actions);
  return option;
}

function setSourceMapTarget(element, source) {
  let place = null;
  if (source.type === "quest") {
    if (state.questie !== null && state.questie.reader) {
      const starter = window.QUESTIE.questStarterFor(state.questie, source.questId);
      if (starter !== null && starter.zone) {
        place = placeForSource(starter);
        place.caption = "Quest giver " + starter.name + ", " + place.caption;
      }
    }
  } else if (source.type === "vendor" || source.type === "drop" || source.type === "object") {
    place = placeForSource(source);
  }
  if (place !== null) {
    setMapTarget(element, place.zone, place.x, place.y, place.caption);
    element.tabIndex = 0;
  }
}

function characterQuestList(character) {
  if (!character.questList) {
    character.questList = [];
  }
  return character.questList;
}

function isInQuestList(character, questId) {
  for (const entry of characterQuestList(character)) {
    if (entry.questId === questId) {
      return true;
    }
  }
  return false;
}

function addToQuestList(questId, itemId) {
  const character = selectedCharacter();
  if (character === null || isInQuestList(character, questId)) {
    return;
  }
  characterQuestList(character).push({ questId: questId, itemId: itemId });
  saveSettings();
  render();
}

function addQuestUpgrades() {
  const character = selectedCharacter();
  for (const pick of state.questUpgradePicks) {
    if (!isInQuestList(character, pick.questId)) {
      characterQuestList(character).push({ questId: pick.questId, itemId: pick.itemId });
    }
  }
  saveSettings();
  render();
}

function clearQuestList() {
  selectedCharacter().questList = [];
  saveSettings();
  render();
}

function removeFromQuestList(questId) {
  const character = selectedCharacter();
  const remaining = [];
  for (const entry of characterQuestList(character)) {
    if (entry.questId !== questId) {
      remaining.push(entry);
    }
  }
  character.questList = remaining;
  saveSettings();
  render();
}

function waypointText(place) {
  return "/way " + place.zone + " " + place.x.toFixed(1) + " " + place.y.toFixed(1);
}

function renderPlace(place) {
  const line = createElement("div", "quest-step-place");
  if (place === null) {
    line.textContent = "Quest giver unknown";
    return line;
  }
  let text = "From " + place.name;
  if (place.title) {
    text += ", " + place.title;
  }
  if (place.kind === "item") {
    text = "Starts from " + place.name;
  }
  if (place.zone) {
    text += " in " + place.zone;
  }
  line.append(text);
  if (place.zone) {
    setMapTarget(line, place.zone, place.x, place.y, placeForSource(place).caption);
  }
  if (place.x !== null) {
    const waypoint = createElement("button", "waypoint", "(" + place.x.toFixed(1) + ", " + place.y.toFixed(1) + ")");
    waypoint.type = "button";
    waypoint.dataset.waypoint = waypointText(place);
    waypoint.title = "Copy " + waypointText(place) + " for Questie or TomTom";
    line.append(" ");
    line.appendChild(waypoint);
  }
  return line;
}

function isChainStepForCharacter(step, snapshot) {
  if (step.faction !== null && step.faction !== snapshot.factionType) {
    return false;
  }
  const classBit = CLASS_BITS[snapshot.className];
  return !step.classes || !classBit || Boolean(step.classes & classBit);
}

function offPathZone(entry, character, snapshot) {
  const item = itemById(entry.itemId);
  if (!isRouteActive(character) || item === null) {
    return null;
  }
  for (const source of sourcesForCharacter(item, snapshot)) {
    if (source.type === "quest" && source.questId === entry.questId) {
      if ((guideZone(source.zone) !== null || dungeonForArea(source.zone) !== null) && legForSource(character, snapshot, source) === null) {
        return source.zone;
      }
      return null;
    }
  }
  return null;
}

function renderOffPathNotice(zoneName, questId) {
  const notice = createElement("div", "quest-off-path", zoneName + " is no longer on your leveling path. ");
  const removeButton = createElement("button", "link", "Remove it");
  removeButton.type = "button";
  removeButton.dataset.questRemove = String(questId);
  notice.appendChild(removeButton);
  return notice;
}

function renderQuestEntry(entry, character, snapshot) {
  const row = createElement("li", "quest-entry");
  const header = createElement("div", "quest-entry-header");
  const item = itemById(entry.itemId);
  if (item !== null) {
    header.appendChild(itemIcon(item, "icon-small"));
    header.appendChild(wowheadLink(item));
  }
  const removeButton = createElement("button", "cart-remove", "×");
  removeButton.type = "button";
  removeButton.dataset.questRemove = String(entry.questId);
  removeButton.setAttribute("aria-label", "Remove from quest list");
  header.appendChild(removeButton);
  row.appendChild(header);
  const offPath = offPathZone(entry, character, snapshot);
  if (offPath !== null) {
    row.appendChild(renderOffPathNotice(offPath, entry.questId));
  }
  if (state.questie === null || !state.questie.reader) {
    row.appendChild(createElement("div", "muted", "Connect your WoW folder to see this quest's chain."));
    return row;
  }
  const steps = [];
  for (const step of window.QUESTIE.questChain(state.questie, entry.questId)) {
    if (isChainStepForCharacter(step, snapshot)) {
      steps.push(step);
    }
  }
  const completed = completedQuests(snapshot);
  const available = window.QUESTIE.availableSteps(steps, completed);
  if (available.length === 0) {
    row.appendChild(createElement("div", "quest-done", "Done: you completed the whole chain."));
    return row;
  }
  if (steps.length > 1) {
    row.appendChild(createElement("div", "muted", completedStepCount(steps, completed) + " of " + steps.length + " quests in this chain done"));
  }
  for (const step of available.slice(0, AVAILABLE_STEPS_SHOWN)) {
    const stepLine = createElement("div", "quest-step");
    stepLine.appendChild(wowheadPageLink("quest", step.id, step.name));
    stepLine.append(" (level " + step.questLevel + ")");
    row.appendChild(stepLine);
    row.appendChild(renderPlace(step.starter));
  }
  if (available.length > AVAILABLE_STEPS_SHOWN) {
    row.appendChild(createElement("div", "muted", "+" + (available.length - AVAILABLE_STEPS_SHOWN) + " more you can pick up now"));
  }
  return row;
}

function completedStepCount(steps, completed) {
  let count = 0;
  for (const step of steps) {
    if (completed.has(step.id)) {
      count += 1;
    }
  }
  return count;
}

function pruneQuestList(character, snapshot) {
  const equipped = equippedItemIds(snapshot);
  const completed = completedQuests(snapshot);
  const kept = [];
  const removedNames = [];
  for (const entry of characterQuestList(character)) {
    if (completed.has(entry.questId) || equipped.has(entry.itemId)) {
      removedNames.push(itemName(entry.itemId));
    } else {
      kept.push(entry);
    }
  }
  character.questList = kept;
  saveSettings();
  return removedNames;
}

function pruneNotInterested(character, snapshot) {
  const removedNames = [];
  const keptItems = [];
  for (const itemId of character.hiddenItemIds || []) {
    const item = itemById(itemId);
    if (item !== null && isUpgradeForAnySpec(item, character, snapshot)) {
      keptItems.push(itemId);
    } else {
      removedNames.push(itemName(itemId));
    }
  }
  const keptDungeons = [];
  for (const dungeonName of character.skippedDungeons || []) {
    if (state.questie === null || dungeonHasUpgrades(dungeonName, character, snapshot)) {
      keptDungeons.push(dungeonName);
    } else {
      removedNames.push(dungeonName);
    }
  }
  character.hiddenItemIds = keptItems;
  character.skippedDungeons = keptDungeons;
  saveSettings();
  return removedNames;
}

function pruneCraftingCart(snapshot) {
  const equipped = equippedItemIds(snapshot);
  const kept = [];
  const removedNames = [];
  for (const entry of state.craftingCart) {
    if (equipped.has(entry.itemId)) {
      removedNames.push(itemName(entry.itemId));
    } else {
      kept.push(entry);
    }
  }
  state.craftingCart = kept;
  writeStorage(STORAGE_KEYS.craftingCart, state.craftingCart);
  return removedNames;
}

function renderQuestList(character, snapshot) {
  const list = document.getElementById("quest-list-items");
  list.replaceChildren();
  const entries = characterQuestList(character);
  document.getElementById("quest-list-empty").hidden = entries.length > 0;
  document.getElementById("quest-list-actions").hidden = entries.length === 0;
  for (const entry of entries) {
    list.appendChild(renderQuestEntry(entry, character, snapshot));
  }
  let missing = 0;
  for (const pick of state.questUpgradePicks || []) {
    if (!isInQuestList(character, pick.questId)) {
      missing += 1;
    }
  }
  const addButton = document.getElementById("add-quest-upgrades-button");
  addButton.hidden = missing === 0;
  addButton.textContent = "Add quest upgrades (" + missing + ")";
}

function handleQuestListClick(event) {
  const target = event.target.closest("button");
  if (target === null) {
    return;
  }
  if (target.dataset.questRemove !== undefined) {
    removeFromQuestList(Number(target.dataset.questRemove));
  } else if (target.dataset.waypoint !== undefined) {
    copyWaypoint(target.dataset.waypoint);
  } else if (target.id === "add-quest-upgrades-button") {
    addQuestUpgrades();
  } else if (target.id === "clear-quest-list-button") {
    clearQuestList();
  }
}

async function copyWaypoint(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied \"" + text + "\". Paste it in the game chat.", "success");
  } catch (error) {
    setStatus(text, "info");
  }
}

function renderOptionPrices(item, craftSource, snapshot, gain, unit) {
  if (state.tsm === null) {
    return null;
  }
  const line = createElement("div", "option-price");
  const auctionPrice = averagePrice(item.id);
  if (auctionPrice !== null) {
    line.append("AH ", renderMoney(auctionPrice));
    if (item.suffix) {
      line.append(" for any suffix");
    } else if (gain > 0) {
      line.append(" (≈ ", renderMoney(Math.round(auctionPrice / gain)), " per " + unit + ")");
    }
  }
  if (craftSource !== null) {
    const cost = averageMaterialCost(craftSource, snapshot);
    if (auctionPrice !== null) {
      line.append(" · ");
    }
    if (cost.total === 0 && cost.missing > 0) {
      line.append("Craft: no material prices yet");
    } else {
      line.append("Craft ", renderMoney(cost.total));
      if (cost.missing > 0) {
        line.append(" + unpriced materials");
      }
    }
  }
  if (line.childNodes.length === 0) {
    return null;
  }
  return line;
}

function renderReplacementPart(options, snapshot, character) {
  const part = createElement("div", "priority-part");
  part.id = "upgrade-" + options.slotDefinition.key;
  const equipped = snapshot.equipment[options.slotDefinition.key];
  const label = createElement("h4", "priority-part-heading");
  if (equipped) {
    label.append("Replace ");
    label.appendChild(wowheadLink(equipped));
  } else {
    label.append("Fill your empty " + options.slotDefinition.label.toLowerCase() + " slot");
  }
  part.appendChild(label);
  const optionRow = createElement("div", "option-row");
  optionRow.appendChild(renderOption("Best upgrade", options.best, snapshot, character, options.slotDefinition));
  if (options.quicker !== null) {
    optionRow.appendChild(renderOption("Quicker option", options.quicker, snapshot, character, options.slotDefinition));
  }
  part.appendChild(optionRow);
  return part;
}

function renderPriorityGroup(group, snapshot, character) {
  const entry = createElement("li", "priority");
  entry.appendChild(createElement("h3", "priority-heading", group.slotDefinition.groupLabel));
  for (const part of group.parts) {
    entry.appendChild(renderReplacementPart(part, snapshot, character));
  }
  return entry;
}

function renderPriority(options, snapshot, character) {
  if (options.group) {
    return renderPriorityGroup(options, snapshot, character);
  }
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
  state.undo = { kind: "item", value: itemId, text: "Hid " + itemName(itemId) + "." };
  render();
}

function skipDungeon(dungeonName) {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  if (!character.skippedDungeons) {
    character.skippedDungeons = [];
  }
  if (character.skippedDungeons.indexOf(dungeonName) === -1) {
    character.skippedDungeons.push(dungeonName);
    saveSettings();
  }
  state.undo = { kind: "dungeon", value: dungeonName, text: "Skipped " + dungeonName + ": its drops and quests no longer count." };
  render();
}

function restoreDungeon(dungeonName) {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  character.skippedDungeons = (character.skippedDungeons || []).filter(function isOtherDungeon(name) {
    return name !== dungeonName;
  });
  saveSettings();
  render();
}

function undoLastHide() {
  const undo = state.undo;
  state.undo = null;
  if (undo === null) {
    return;
  }
  if (undo.kind === "item") {
    restoreItem(undo.value);
  } else {
    restoreDungeon(undo.value);
  }
}

function renderUndoNotice() {
  const notice = document.getElementById("undo-notice");
  notice.replaceChildren();
  notice.hidden = state.undo === null;
  if (state.undo === null) {
    return;
  }
  notice.append(state.undo.text + " ");
  const undoButton = createElement("button", "link", "Undo");
  undoButton.type = "button";
  undoButton.dataset.undo = "true";
  notice.appendChild(undoButton);
}

function handleUndoClick(event) {
  if (event.target.dataset.undo !== undefined) {
    undoLastHide();
  }
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
  clearSourceCache();
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
    document.getElementById("planner-sidebar").hidden = true;
    if (character !== null) {
      setStatus("Press Refresh to load " + character.displayName + ".", "info");
    }
    return;
  }
  welcome.hidden = true;
  armory.hidden = false;
  priorities.hidden = false;
  document.getElementById("planner-sidebar").hidden = false;

  document.getElementById("character-name").textContent = character.displayName;
  document.getElementById("character-meta").textContent =
    "Level " + snapshot.level + " " + snapshot.raceName + " " + snapshot.className + " · " + snapshot.faction +
    " · " + snapshot.ruleset;
  document.getElementById("character-specs").textContent =
    "Comparing for " + specLabel(activeSpec(character)) +
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
  const handledPairs = new Set();
  const weaponQuests = emptyBlockList();
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    if (slotDefinition.cosmetic || handledPairs.has(slotDefinition.key)) {
      continue;
    }
    if (slotDefinition.pairedWith) {
      handledPairs.add(slotDefinition.key);
      handledPairs.add(slotDefinition.pairedWith);
      const group = pairedUpgradeOptions(slotDefinition, snapshot, character);
      for (const part of group.parts) {
        optionsBySlot[part.slotDefinition.key] = part;
      }
      if (group.parts.length > 0) {
        allOptions.push(group);
      }
      continue;
    }
    let blocked = emptyBlockList();
    if (slotDefinition.key === "MAIN_HAND" || slotDefinition.key === "OFF_HAND") {
      blocked = weaponQuests;
    }
    const options = upgradeOptions(slotDefinition, snapshot, character, blocked);
    if (options === null) {
      continue;
    }
    if (slotDefinition.key === "MAIN_HAND") {
      blockQuestPicks(options, snapshot, weaponQuests);
    }
    optionsBySlot[slotDefinition.key] = options;
    allOptions.push(options);
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
  renderRoutePanel(character, snapshot);
  document.getElementById("route-credit").textContent = window.ZONE_GUIDE.credit;
  renderHiddenItems(character);
  renderUndoNotice();
  allOptions.sort(compareUpgradeOptions);
  const priorityList = document.getElementById("priority-list");
  priorityList.replaceChildren();
  for (const options of allOptions) {
    priorityList.appendChild(renderPriority(options, snapshot, character));
  }
  state.craftedUpgradePicks = craftedUpgradePicks(allOptions, snapshot);
  state.questUpgradePicks = questUpgradePicks(allOptions, snapshot);
  renderCart();
  renderQuestList(character, snapshot);
  runTooltipChecks();
}

function renderCharacterList() {
  renderFoundCharacters();
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
    const removeButton = createElement("button", "character-remove", "×");
    removeButton.type = "button";
    removeButton.dataset.removeCharacterSlug = character.slug;
    removeButton.setAttribute("aria-label", "Remove " + character.displayName);
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
    const playstyle = window.GAME_RULES.playstyles[playstyleKey];
    let label = playstyle.label;
    if (playstyle.pvpRulesetLabel && isPvpRuleset(snapshot)) {
      label = playstyle.pvpRulesetLabel;
    }
    playstyleChoices.push({ value: playstyleKey, label: label });
  }
  renderChoiceGroup(document.getElementById("playstyle-choices"), "playstyle", playstyleChoices, characterPlaystyle(character));
  const goldLimitInput = document.getElementById("gold-limit");
  goldLimitInput.value = "";
  if (character.maxGoldPerUpgrade !== undefined && character.maxGoldPerUpgrade !== null) {
    goldLimitInput.value = String(character.maxGoldPerUpgrade);
  }
  const specs = characterSpecs(character, snapshot);
  const gearForGroup = document.getElementById("gear-for");
  gearForGroup.hidden = specs.length < 2;
  if (specs.length > 1) {
    let gearFor = "main";
    if (character.gearFor === "off") {
      gearFor = "off";
    }
    renderChoiceGroup(document.getElementById("gear-for-choices"), "gear-for",
      [{ value: "main", label: "Main: " + specLabel(specs[0]) }, { value: "off", label: "Off: " + specLabel(specs[1]) }], gearFor);
  }
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
  const skipped = character.skippedDungeons || [];
  container.hidden = hiddenIds.length === 0 && skipped.length === 0;
  for (const dungeonName of skipped) {
    const entry = createElement("li", "hidden-item");
    entry.appendChild(createElement("span", null, dungeonName + " (dungeon)"));
    const restoreButton = createElement("button", "link", "Bring back");
    restoreButton.type = "button";
    restoreButton.dataset.restoreDungeon = dungeonName;
    entry.appendChild(restoreButton);
    list.appendChild(entry);
  }
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

function addCharacterNamed(name, surname) {
  const slug = characterSlug(name, surname);
  if (findCharacter(slug) !== null) {
    setStatus(name + " " + surname + " is already in your list.", "error");
    return false;
  }
  state.settings.characters.push({ slug: slug, displayName: name + " " + surname, hiddenItemIds: [] });
  state.settings.selectedCharacterSlug = slug;
  saveSettings();
  renderCharacterList();
  render();
  return true;
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
  if (addCharacterNamed(name, surname)) {
    nameInput.value = "";
    surnameInput.value = "";
  }
}

function foundCharacters() {
  const found = [];
  if (state.inventory === null) {
    return found;
  }
  for (const fullName of Object.keys(state.inventory.characters).sort()) {
    const separator = fullName.indexOf(" ");
    if (separator === -1) {
      continue;
    }
    const name = fullName.slice(0, separator);
    const surname = fullName.slice(separator + 1);
    if (findCharacter(characterSlug(name, surname)) === null) {
      found.push({ name: name, surname: surname, ruleset: state.inventory.characters[fullName].ruleset });
    }
  }
  return found;
}

function renderFoundCharacters() {
  const container = document.getElementById("found-characters");
  container.replaceChildren();
  const found = foundCharacters();
  container.hidden = found.length === 0;
  if (found.length === 0) {
    return;
  }
  container.appendChild(createElement("p", "muted", "Found in your WoW folder:"));
  for (const character of found) {
    const button = createElement("button", "found-character", "Add " + character.name + " " + character.surname + " (" + character.ruleset + ")");
    button.type = "button";
    button.dataset.foundName = character.name;
    button.dataset.foundSurname = character.surname;
    container.appendChild(button);
  }
}

function handleFoundCharacterClick(event) {
  const button = event.target.closest("button");
  if (button === null || button.dataset.foundName === undefined) {
    return;
  }
  addCharacterNamed(button.dataset.foundName, button.dataset.foundSurname);
  renderFoundCharacters();
}

function openSettings() {
  document.getElementById("client-id-input").value = state.credentials.clientId;
  document.getElementById("client-secret-input").value = state.credentials.clientSecret;
  document.getElementById("region-select").value = state.settings.region;
  document.getElementById("lookahead-input").value = String(state.settings.lookaheadLevels);
  renderFolderStatus();
  renderCharacterList();
  let firstTab = "characters";
  if (!state.credentials.clientId || !state.credentials.clientSecret) {
    firstTab = "battlenet";
  }
  showSettingsTab(firstTab);
  document.getElementById("settings-dialog").showModal();
}

function showSettingsTab(tabKey) {
  for (const tab of document.querySelectorAll("[data-settings-tab]")) {
    const isSelected = tab.dataset.settingsTab === tabKey;
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = -1;
    if (isSelected) {
      tab.tabIndex = 0;
    }
    document.getElementById("settings-panel-" + tab.dataset.settingsTab).hidden = !isSelected;
  }
}

function handleSettingsTabClick(event) {
  const tab = event.target.closest("[data-settings-tab]");
  if (tab !== null) {
    showSettingsTab(tab.dataset.settingsTab);
  }
}

function handleSettingsKeydown(event) {
  if (event.key !== "Enter" || event.target.tagName !== "INPUT") {
    return;
  }
  event.preventDefault();
  if (event.target.id === "new-character-name" || event.target.id === "new-character-surname") {
    addCharacter();
  }
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
  state.settings.lookaheadLevels = clampedLookahead(document.getElementById("lookahead-input").value);
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

function clampedLookahead(value) {
  const levels = Math.round(Number(value));
  if (!(levels >= 0)) {
    return DEFAULT_LOOKAHEAD_LEVELS;
  }
  return Math.min(MAX_LOOKAHEAD_LEVELS, levels);
}

function validatedSettings(imported) {
  if (imported === null || typeof imported !== "object" || !Array.isArray(imported.characters)) {
    return null;
  }
  const settings = defaultSettings();
  if (REGIONS.indexOf(imported.region) !== -1) {
    settings.region = imported.region;
  }
  settings.lookaheadLevels = clampedLookahead(imported.lookaheadLevels);
  for (const character of imported.characters) {
    if (character === null || typeof character !== "object" || typeof character.slug !== "string" || typeof character.displayName !== "string") {
      return null;
    }
    if (!Array.isArray(character.hiddenItemIds)) {
      character.hiddenItemIds = [];
    }
    if (!Array.isArray(character.skippedDungeons)) {
      character.skippedDungeons = [];
    }
    if (character.maxGoldPerUpgrade !== undefined && character.maxGoldPerUpgrade !== null && !(Number(character.maxGoldPerUpgrade) >= 0)) {
      character.maxGoldPerUpgrade = null;
    }
    settings.characters.push(character);
  }
  for (const character of settings.characters) {
    if (character.slug === imported.selectedCharacterSlug) {
      settings.selectedCharacterSlug = character.slug;
    }
  }
  if (settings.selectedCharacterSlug === null && settings.characters.length > 0) {
    settings.selectedCharacterSlug = settings.characters[0].slug;
  }
  return settings;
}

function handleSettingsFileLoaded(event) {
  try {
    const imported = validatedSettings(JSON.parse(String(event.target.result)));
    if (imported === null) {
      setStatus("That file is not a valid settings file. Nothing was changed.", "error");
      return;
    }
    state.settings = imported;
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

function currentPriceScope() {
  const character = selectedCharacter();
  if (character !== null && state.snapshots[character.slug]) {
    return { ruleset: state.snapshots[character.slug].ruleset, faction: state.snapshots[character.slug].faction };
  }
  return { ruleset: "", faction: "" };
}

function questieQuestIds() {
  const questIds = new Set();
  for (const item of window.FOREVER_ITEMS) {
    for (const source of item.sources || []) {
      if (source.type === "quest") {
        questIds.add(source.questId);
      }
    }
  }
  return Array.from(questIds);
}

function questieItemIds() {
  const itemIds = new Set();
  for (const item of window.FOREVER_ITEMS) {
    itemIds.add(item.id);
    for (const source of item.sources || []) {
      for (const reagent of source.reagents || []) {
        itemIds.add(reagent.id);
      }
    }
  }
  return Array.from(itemIds);
}

function setSourceStatus(elementId, text, isFound) {
  const element = document.getElementById(elementId);
  element.textContent = text;
  element.classList.toggle("source-found", isFound);
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
  setSourceStatus("questie-status", questieStatusText(), state.questie !== null);
  setSourceStatus("tsm-status", tsmStatusText(), state.tsm !== null);
  setSourceStatus("inventory-status", inventoryStatusText(), state.inventory !== null);
  renderFoundCharacters();
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
  state.inventory = null;
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
    const snapshot = state.snapshots[character.slug];
    const removedNames = pruneQuestList(character, snapshot).concat(pruneCraftingCart(snapshot));
    const outgrownNames = pruneNotInterested(character, snapshot);
    const messages = [];
    if (removedNames.length > 0) {
      messages.push("Removed from your lists because you finished or equipped them: " + Array.from(new Set(removedNames)).join(", ") + ".");
    }
    if (outgrownNames.length > 0) {
      messages.push("No longer upgrades, so dropped from your not-interested list: " + outgrownNames.join(", ") + ".");
    }
    if (messages.length > 0) {
      setStatus("Updated. " + messages.join(" "), "success");
    }
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    refreshButton.disabled = false;
  }
}

function craftedPick(options, snapshot) {
  if (firstCraftSource(sourcesForCharacter(options.best.item, snapshot)) !== null) {
    return options.best.item.id;
  }
  if (options.quicker !== null && firstCraftSource(sourcesForCharacter(options.quicker.item, snapshot)) !== null) {
    return options.quicker.item.id;
  }
  return null;
}

function upgradeParts(allOptions) {
  const parts = [];
  for (const options of allOptions) {
    if (options.group) {
      for (const part of options.parts) {
        parts.push(part);
      }
    } else {
      parts.push(options);
    }
  }
  return parts;
}

function craftedUpgradePicks(allOptions, snapshot) {
  const picks = [];
  for (const part of upgradeParts(allOptions)) {
    const itemId = craftedPick(part, snapshot);
    if (itemId !== null && picks.indexOf(itemId) === -1) {
      picks.push(itemId);
    }
  }
  return picks;
}

function questPick(candidate, snapshot) {
  const questSource = firstQuestSource(sourcesForCharacter(candidate.item, snapshot));
  if (questSource === null) {
    return null;
  }
  return { questId: questSource.questId, itemId: candidate.item.id };
}

function questUpgradePicks(allOptions, snapshot) {
  const picks = [];
  const questIds = new Set();
  for (const part of upgradeParts(allOptions)) {
    let pick = questPick(part.best, snapshot);
    if (pick === null && part.quicker !== null) {
      pick = questPick(part.quicker, snapshot);
    }
    if (pick !== null && !questIds.has(pick.questId)) {
      questIds.add(pick.questId);
      picks.push(pick);
    }
  }
  return picks;
}

function isInCart(itemId) {
  for (const entry of state.craftingCart) {
    if (entry.itemId === itemId) {
      return true;
    }
  }
  return false;
}

function addCraftedUpgrades() {
  for (const itemId of state.craftedUpgradePicks) {
    if (!isInCart(itemId)) {
      state.craftingCart.push({ itemId: itemId, quantity: 1 });
    }
  }
  writeStorage(STORAGE_KEYS.craftingCart, state.craftingCart);
  renderCart();
}

function addToCart(itemId) {
  for (const entry of state.craftingCart) {
    if (entry.itemId === itemId) {
      entry.quantity += 1;
      writeStorage(STORAGE_KEYS.craftingCart, state.craftingCart);
      renderCart();
      return;
    }
  }
  state.craftingCart.push({ itemId: itemId, quantity: 1 });
  writeStorage(STORAGE_KEYS.craftingCart, state.craftingCart);
  renderCart();
}

function cartHash() {
  const parts = [];
  for (const entry of state.craftingCart) {
    parts.push(entry.itemId + ":" + entry.quantity);
  }
  return "#items=" + parts.join(",");
}

function renderCart() {
  const list = document.getElementById("crafting-cart-items");
  list.replaceChildren();
  const isEmpty = state.craftingCart.length === 0;
  document.getElementById("crafting-cart-empty").hidden = !isEmpty;
  document.getElementById("crafting-cart-actions").hidden = isEmpty;
  for (let index = 0; index < state.craftingCart.length; index += 1) {
    const entry = state.craftingCart[index];
    const row = createElement("li", "crafting-cart-row");
    const item = itemById(entry.itemId);
    if (item !== null) {
      row.appendChild(itemIcon(item, "icon-small"));
      row.appendChild(wowheadLink(item));
    } else {
      row.appendChild(createElement("span", null, "Item " + entry.itemId));
    }
    const quantity = createElement("input", "cart-quantity");
    quantity.type = "number";
    quantity.min = "1";
    quantity.value = String(entry.quantity);
    quantity.id = "cart-quantity-" + index;
    quantity.dataset.cartIndex = String(index);
    quantity.setAttribute("aria-label", "How many");
    row.appendChild(quantity);
    const removeButton = createElement("button", "cart-remove", "×");
    removeButton.type = "button";
    removeButton.dataset.cartRemove = String(index);
    removeButton.setAttribute("aria-label", "Remove from crafting list");
    row.appendChild(removeButton);
    list.appendChild(row);
  }
  document.getElementById("craft-all-link").href = "crafting.html" + cartHash();
  let missing = 0;
  for (const itemId of state.craftedUpgradePicks || []) {
    if (!isInCart(itemId)) {
      missing += 1;
    }
  }
  const addButton = document.getElementById("add-crafted-button");
  addButton.hidden = missing === 0;
  addButton.textContent = "Add crafted upgrades (" + missing + ")";
}

function handleCartClick(event) {
  const target = event.target;
  if (target.dataset.cartRemove !== undefined) {
    state.craftingCart.splice(Number(target.dataset.cartRemove), 1);
  } else if (target.id === "clear-cart-button") {
    state.craftingCart = [];
  } else if (target.id === "add-crafted-button") {
    addCraftedUpgrades();
    return;
  } else {
    return;
  }
  writeStorage(STORAGE_KEYS.craftingCart, state.craftingCart);
  renderCart();
}

function handleCartChange(event) {
  const target = event.target;
  if (target.dataset.cartIndex === undefined) {
    return;
  }
  state.craftingCart[Number(target.dataset.cartIndex)].quantity = Math.max(1, Number(target.value) || 1);
  writeStorage(STORAGE_KEYS.craftingCart, state.craftingCart);
  renderCart();
}

function handlePriorityListClick(event) {
  if (event.target.dataset.questAdd !== undefined) {
    addToQuestList(Number(event.target.dataset.questAdd), Number(event.target.dataset.questItem));
    return;
  }
  if (event.target.dataset.cartAdd !== undefined) {
    addToCart(Number(event.target.dataset.cartAdd));
    return;
  }
  if (event.target.dataset.skipDungeon !== undefined) {
    skipDungeon(event.target.dataset.skipDungeon);
    return;
  }
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

function goldLimitFromInput(value) {
  const gold = Number(value);
  if (value.trim() === "" || !Number.isFinite(gold) || gold < 0) {
    return null;
  }
  return gold;
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
  if (event.target.name === "gear-for") {
    character.gearFor = event.target.value;
  }
  if (event.target.name === "gold-limit") {
    character.maxGoldPerUpgrade = goldLimitFromInput(event.target.value);
  }
  saveSettings();
  render();
}

function handleHiddenItemsClick(event) {
  if (event.target.dataset.restoreDungeon !== undefined) {
    restoreDungeon(event.target.dataset.restoreDungeon);
    return;
  }
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
  routeEditor.pendingGap = null;
  saveSettings();
  render();
  readWowFolder(false).then(render).catch(handleTsmStartupError);
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
  document.getElementById("undo-notice").addEventListener("click", handleUndoClick);
  document.getElementById("character-list").addEventListener("click", handleCharacterListClick);
  document.getElementById("play-controls").addEventListener("change", handlePlayControlsChange);
  document.getElementById("hidden-items").addEventListener("click", handleHiddenItemsClick);
  document.getElementById("route-panel").addEventListener("click", handleRouteClick);
  document.getElementById("found-characters").addEventListener("click", handleFoundCharacterClick);
  document.querySelector(".settings-tabs").addEventListener("click", handleSettingsTabClick);
  document.getElementById("quest-list-panel").addEventListener("click", handleQuestListClick);
  document.getElementById("settings-form").addEventListener("keydown", handleSettingsKeydown);
  document.getElementById("crafting-cart").addEventListener("click", handleCartClick);
  document.getElementById("crafting-cart").addEventListener("change", handleCartChange);
  document.getElementById("route-panel").addEventListener("change", handleRouteChange);
}

function handleTsmStartupError(error) {
  setStatus("Could not read your WoW folder: " + error.message, "error");
}

function start() {
  observeRanking(queueTooltipChecks);
  enableMapPopovers();
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
