const STORAGE_KEYS = {
  credentials: "foreverPlanner.credentials",
  settings: "foreverPlanner.settings",
  snapshots: "foreverPlanner.snapshots"
};

const DEFAULT_LOOKAHEAD_LEVELS = 3;
const DETAIL_CANDIDATES_PER_SLOT = 3;
const WOWHEAD_ITEM_URL = "https://www.wowhead.com/forever/item=";

const state = {
  credentials: null,
  settings: null,
  snapshots: {},
  accessToken: null,
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
    hiddenItemIds: [],
    weightOverrides: {}
  };
}

function loadState() {
  state.credentials = readStorage(STORAGE_KEYS.credentials, { clientId: "", clientSecret: "" });
  state.settings = Object.assign(defaultSettings(), readStorage(STORAGE_KEYS.settings, {}));
  state.snapshots = readStorage(STORAGE_KEYS.snapshots, {});
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

async function fetchProfile(characterSlugValue, path) {
  const token = await fetchAccessToken();
  const region = state.settings.region;
  const url = "https://" + region + ".api.blizzard.com/profile/wow/character/" +
    encodeURIComponent(characterSlugValue) + path +
    "?namespace=profile-forever-" + region + "&locale=en_GB";
  const response = await fetch(url, { headers: { "Authorization": "Bearer " + token } });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Battle.net returned status " + response.status + " for " + path + ".");
  }
  return response.json();
}

function avatarUrl(media) {
  if (media === null) {
    return null;
  }
  for (const asset of media.assets || []) {
    if (asset.key === "avatar") {
      return asset.value;
    }
  }
  return null;
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
      enchantments: []
    };
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
    fetchProfile(character.slug, "/character-media")
  ]);
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
    equipment: compactEquipment(results[0]),
    professions: compactProfessions(results[1]),
    avatar: avatarUrl(results[2])
  };
  if (!character.specs) {
    character.specs = defaultSpecsForClass(profile.character_class.name);
    saveSettings();
  }
  saveSnapshots();
  setStatus("Updated from your last logout (" + new Date(profile.last_login_timestamp).toLocaleString() + ").", "success");
}

function defaultSpecsForClass(className) {
  const specs = window.GAME_RULES.defaultSpecsByClass[className];
  if (specs) {
    return specs.slice();
  }
  return ["melee-agility", "caster-damage"];
}

function specWeights(specKey) {
  const preset = window.GAME_RULES.specPresets[specKey];
  const weights = Object.assign({}, preset.weights);
  const overrides = state.settings.weightOverrides[specKey];
  if (overrides) {
    Object.assign(weights, overrides);
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
  const primaryWeights = specWeights(character.specs[0]);
  const secondaryWeights = specWeights(character.specs[1]);
  const equippedIds = new Set();
  for (const slotKey of Object.keys(equipment)) {
    equippedIds.add(equipment[slotKey].id);
  }
  const hiddenIds = new Set(state.settings.hiddenItemIds);
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
    const secondaryGain = itemScore(item, secondaryWeights) - comparisonBaseline(slotDefinition, snapshot, item, secondaryWeights);
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

function wowheadLink(item) {
  const link = createElement("a", qualityClass(item.quality), item.name);
  link.href = WOWHEAD_ITEM_URL + item.id;
  link.target = "_blank";
  link.rel = "noopener";
  return link;
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

function specLabel(specKey) {
  return window.GAME_RULES.specPresets[specKey].label;
}

function hasProfession(snapshot, professionName) {
  for (const profession of snapshot.professions) {
    if (profession.name === professionName) {
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

function renderSlotTile(slotDefinition, snapshot, character) {
  const template = document.getElementById("slot-template");
  const tile = template.content.firstElementChild.cloneNode(true);
  tile.querySelector(".slot-label").textContent = slotDefinition.label;
  const equipped = snapshot.equipment[slotDefinition.key];
  const equippedContainer = tile.querySelector(".slot-equipped");
  if (equipped) {
    equippedContainer.appendChild(wowheadLink(equipped));
  } else {
    equippedContainer.appendChild(createElement("span", "muted", "Empty"));
  }
  const upgradeContainer = tile.querySelector(".slot-upgrade");
  const candidates = candidatesForSlot(slotDefinition, snapshot, character);
  if (candidates.length === 0) {
    upgradeContainer.appendChild(createElement("span", "muted", "No upgrade found"));
    return tile;
  }
  const best = candidates[0];
  upgradeContainer.appendChild(createElement("span", "arrow", "→"));
  upgradeContainer.appendChild(wowheadLink(best.item));
  if (best.item.usableLevel > snapshot.level) {
    upgradeContainer.appendChild(createElement("span", "level-tag", levelText(best.item, "lvl ")));
  }
  const gains = createElement("div", "gains");
  gains.appendChild(gainBadge(best.primaryGain, specLabel(character.specs[0])));
  gains.appendChild(gainBadge(best.secondaryGain, specLabel(character.specs[1])));
  upgradeContainer.appendChild(gains);
  return tile;
}

function levelText(item, prefix) {
  if (item.levelEstimated) {
    return "about " + prefix + item.usableLevel;
  }
  return prefix + item.usableLevel;
}

function statSummary(item) {
  const parts = [];
  for (const statKey of Object.keys(item.stats || {})) {
    const label = window.GAME_RULES.statLabels[statKey] || statKey;
    parts.push("+" + item.stats[statKey] + " " + label);
  }
  if (item.weapon) {
    parts.push(item.weapon.damagePerSecond.toFixed(1) + " DPS");
  }
  return parts.join(", ");
}

function renderDetailCandidate(candidate, snapshot, character) {
  const item = candidate.item;
  const row = createElement("div", "candidate");
  const heading = createElement("div", "candidate-heading");
  heading.appendChild(wowheadLink(item));
  heading.appendChild(createElement("span", "muted", item.itemSubclass + " · " + levelText(item, "level ")));
  row.appendChild(heading);

  const gains = createElement("div", "gains");
  gains.appendChild(gainBadge(candidate.primaryGain, specLabel(character.specs[0])));
  gains.appendChild(gainBadge(candidate.secondaryGain, specLabel(character.specs[1])));
  row.appendChild(gains);

  row.appendChild(createElement("div", "candidate-stats", statSummary(item)));
  for (const effect of item.effects || []) {
    row.appendChild(createElement("div", "candidate-effect", effect));
  }
  if (item.reputation) {
    row.appendChild(createElement("div", "candidate-requirement", item.reputation));
  }
  if (item.skill) {
    row.appendChild(createElement("div", "candidate-requirement", item.skill));
  }

  const sourceList = createElement("ul", "sources");
  if (item.sources && item.sources.length > 0) {
    for (const source of item.sources) {
      if (source.faction && source.faction !== snapshot.factionType) {
        continue;
      }
      const entry = createElement("li", null, describeSource(source, snapshot));
      if (source.type === "craft" && source.reagents.length > 0) {
        const reagentTexts = [];
        for (const reagent of source.reagents) {
          reagentTexts.push(reagent.quantity + "× " + reagent.name);
        }
        entry.appendChild(createElement("div", "muted", reagentTexts.join(", ")));
      }
      sourceList.appendChild(entry);
    }
  } else {
    sourceList.appendChild(createElement("li", "muted", "Source not in Blizzard's data. Check Wowhead (drop, vendor or world item)."));
  }
  row.appendChild(sourceList);

  const hideButton = createElement("button", "link", "Hide this item");
  hideButton.type = "button";
  hideButton.dataset.hideItemId = String(item.id);
  row.appendChild(hideButton);
  return row;
}

function hideItem(itemId) {
  if (state.settings.hiddenItemIds.indexOf(itemId) === -1) {
    state.settings.hiddenItemIds.push(itemId);
    saveSettings();
  }
  render();
}

function renderDetails(snapshot, character) {
  const detailList = document.getElementById("detail-list");
  detailList.replaceChildren();
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    const candidates = candidatesForSlot(slotDefinition, snapshot, character).slice(0, DETAIL_CANDIDATES_PER_SLOT);
    if (candidates.length === 0) {
      continue;
    }
    const group = createElement("section", "detail-group");
    const heading = createElement("h3", null, slotDefinition.label);
    const equipped = snapshot.equipment[slotDefinition.key];
    if (equipped) {
      const current = createElement("span", "muted", " · now: ");
      current.appendChild(wowheadLink(equipped));
      heading.appendChild(current);
    }
    group.appendChild(heading);
    for (const candidate of candidates) {
      group.appendChild(renderDetailCandidate(candidate, snapshot, character));
    }
    detailList.appendChild(group);
  }
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
  const details = document.getElementById("details");
  let snapshot = null;
  if (character !== null) {
    snapshot = state.snapshots[character.slug] || null;
  }
  if (character === null || snapshot === null || !character.specs) {
    welcome.hidden = false;
    armory.hidden = true;
    details.hidden = true;
    if (character !== null) {
      setStatus("Press Refresh to load " + character.displayName + ".", "info");
    }
    return;
  }
  welcome.hidden = true;
  armory.hidden = false;
  details.hidden = false;

  document.getElementById("character-name").textContent = character.displayName;
  document.getElementById("character-meta").textContent =
    "Level " + snapshot.level + " " + snapshot.raceName + " " + snapshot.className + " · " + snapshot.faction +
    " · " + snapshot.ruleset;
  document.getElementById("character-specs").textContent =
    "Comparing for " + specLabel(character.specs[0]) + " and " + specLabel(character.specs[1]) +
    " · data from logout " + new Date(snapshot.lastLogout).toLocaleString();
  const avatar = document.getElementById("character-avatar");
  if (snapshot.avatar) {
    avatar.src = snapshot.avatar;
    avatar.hidden = false;
  } else {
    avatar.hidden = true;
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
    columns[slotDefinition.column].appendChild(renderSlotTile(slotDefinition, snapshot, character));
  }
  document.getElementById("lookahead-label").textContent = String(state.settings.lookaheadLevels);
  renderDetails(snapshot, character);
}

function renderCharacterList() {
  const list = document.getElementById("character-list");
  list.replaceChildren();
  const presetKeys = Object.keys(window.GAME_RULES.specPresets);
  for (const character of state.settings.characters) {
    const row = createElement("div", "character-row");
    row.appendChild(createElement("span", "character-row-name", character.displayName));
    const specs = character.specs || ["melee-agility", "caster-damage"];
    for (let specIndex = 0; specIndex < 2; specIndex += 1) {
      const select = createElement("select");
      select.setAttribute("aria-label", character.displayName + " spec " + (specIndex + 1));
      for (const presetKey of presetKeys) {
        const option = createElement("option", null, specLabel(presetKey));
        option.value = presetKey;
        option.selected = specs[specIndex] === presetKey;
        select.appendChild(option);
      }
      select.dataset.characterSlug = character.slug;
      select.dataset.specIndex = String(specIndex);
      row.appendChild(select);
    }
    const removeButton = createElement("button", "link", "Remove");
    removeButton.type = "button";
    removeButton.dataset.removeCharacterSlug = character.slug;
    row.appendChild(removeButton);
    list.appendChild(row);
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
  state.settings.characters.push({ slug: slug, displayName: name + " " + surname, specs: null });
  state.settings.selectedCharacterSlug = slug;
  nameInput.value = "";
  surnameInput.value = "";
  saveSettings();
  renderCharacterList();
  render();
}

function renderWeightsEditor() {
  const presetSelect = document.getElementById("weights-preset-select");
  const editor = document.getElementById("weights-editor");
  editor.replaceChildren();
  const specKey = presetSelect.value;
  const weights = specWeights(specKey);
  for (const statKey of Object.keys(window.GAME_RULES.statLabels)) {
    const inputId = "weight-" + statKey;
    const label = createElement("label", null, window.GAME_RULES.statLabels[statKey]);
    label.htmlFor = inputId;
    const input = createElement("input");
    input.id = inputId;
    input.type = "number";
    input.step = "0.05";
    input.value = String(weights[statKey] || 0);
    input.dataset.statKey = statKey;
    editor.appendChild(label);
    editor.appendChild(input);
  }
}

function openSettings() {
  document.getElementById("client-id-input").value = state.credentials.clientId;
  document.getElementById("client-secret-input").value = state.credentials.clientSecret;
  document.getElementById("region-select").value = state.settings.region;
  document.getElementById("lookahead-input").value = String(state.settings.lookaheadLevels);
  document.getElementById("hidden-item-count").textContent = state.settings.hiddenItemIds.length + " hidden items.";
  const presetSelect = document.getElementById("weights-preset-select");
  presetSelect.replaceChildren();
  for (const presetKey of Object.keys(window.GAME_RULES.specPresets)) {
    const option = createElement("option", null, specLabel(presetKey));
    option.value = presetKey;
    presetSelect.appendChild(option);
  }
  renderWeightsEditor();
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

function handleDetailListClick(event) {
  const itemId = event.target.dataset.hideItemId;
  if (itemId !== undefined) {
    hideItem(Number(itemId));
  }
}

function handleCharacterListChange(event) {
  const select = event.target;
  const character = findCharacter(select.dataset.characterSlug);
  if (character === null) {
    return;
  }
  const updatedSpecs = (character.specs || defaultSpecsForClass("")).slice();
  updatedSpecs[Number(select.dataset.specIndex)] = select.value;
  character.specs = updatedSpecs;
  saveSettings();
}

function handleCharacterListClick(event) {
  const slug = event.target.dataset.removeCharacterSlug;
  if (slug !== undefined) {
    removeCharacter(slug);
  }
}

function handleWeightsEditorChange(event) {
  const input = event.target;
  const specKey = document.getElementById("weights-preset-select").value;
  const overrides = state.settings.weightOverrides[specKey] || {};
  overrides[input.dataset.statKey] = Number(input.value);
  state.settings.weightOverrides[specKey] = overrides;
  saveSettings();
}

function handleResetWeights() {
  const specKey = document.getElementById("weights-preset-select").value;
  delete state.settings.weightOverrides[specKey];
  saveSettings();
  renderWeightsEditor();
}

function handleClearHidden() {
  state.settings.hiddenItemIds = [];
  saveSettings();
  document.getElementById("hidden-item-count").textContent = "0 hidden items.";
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
  document.getElementById("weights-preset-select").addEventListener("change", renderWeightsEditor);
  document.getElementById("reset-weights-button").addEventListener("click", handleResetWeights);
  document.getElementById("clear-hidden-button").addEventListener("click", handleClearHidden);
  document.getElementById("export-button").addEventListener("click", exportSettings);
  document.getElementById("import-input").addEventListener("change", handleImportChange);
  document.getElementById("character-select").addEventListener("change", handleCharacterSelectChange);
  document.getElementById("detail-list").addEventListener("click", handleDetailListClick);
  document.getElementById("character-list").addEventListener("change", handleCharacterListChange);
  document.getElementById("character-list").addEventListener("click", handleCharacterListClick);
  document.getElementById("weights-editor").addEventListener("change", handleWeightsEditorChange);
}

function start() {
  loadState();
  bindEvents();
  if (!window.FOREVER_ITEMS) {
    setStatus("Game data is missing (web/data/items.js). Pull the latest version of the planner.", "error");
    return;
  }
  render();
  if (state.settings.characters.length === 0) {
    setStatus("Open Settings to add your API client and a character.", "info");
  }
}

start();
