const STORAGE_KEYS = {
  credentials: "foreverPlanner.credentials",
  settings: "foreverPlanner.settings",
  snapshots: "foreverPlanner.snapshots",
  crafting: "foreverPlanner.crafting"
};

const DEFAULT_LOOKAHEAD_LEVELS = 3;
const WOWHEAD_ITEM_URL = "https://www.wowhead.com/forever/item=";

const state = {
  credentials: null,
  settings: null,
  snapshots: {},
  accessToken: null,
  accessTokenExpiresAt: 0,
  tsm: null,
  questie: null,
  inventory: null,
  wowFolderConnected: false
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

function findCharacter(slug) {
  for (const character of state.settings.characters) {
    if (character.slug === slug) {
      return character;
    }
  }
  return null;
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

function renderMoney(copper) {
  const money = createElement("span", "money");
  const rounded = Math.round(copper);
  const amounts = [
    { value: Math.floor(rounded / 10000), coin: "gold" },
    { value: Math.floor((rounded % 10000) / 100), coin: "silver" },
    { value: rounded % 100, coin: "copper" }
  ];
  let shown = 0;
  for (const amount of amounts) {
    if (amount.value === 0 && !(amount.coin === "copper" && shown === 0)) {
      continue;
    }
    const part = createElement("span", "money-part", String(amount.value));
    const coin = createElement("span", "coin coin-" + amount.coin);
    coin.setAttribute("aria-label", amount.coin);
    part.appendChild(coin);
    money.appendChild(part);
    shown += 1;
  }
  money.setAttribute("aria-label", formatMoney(rounded));
  return money;
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

function selectedRulesetAndFaction() {
  const character = selectedCharacter();
  if (character !== null && state.snapshots[character.slug]) {
    return { ruleset: state.snapshots[character.slug].ruleset, faction: state.snapshots[character.slug].faction };
  }
  return { ruleset: "", faction: "" };
}

async function readQuestieFile(folder) {
  const questieFile = await window.WOW_FOLDER.readAddonFile(folder, window.QUESTIE.addonName, window.QUESTIE.fileName);
  if (questieFile === null) {
    state.questie = null;
    return;
  }
  if (state.questie !== null && state.questie.modifiedAt === questieFile.modifiedAt) {
    return;
  }
  const details = window.QUESTIE.buildDetails(questieFile.text, questieItemIds(), window.FOREVER_ZONES);
  details.modifiedAt = questieFile.modifiedAt;
  state.questie = details;
}

async function readTsmFromFolder(folder) {
  const tsmFile = await window.WOW_FOLDER.readAddonFile(folder, window.TSM.addonName, window.TSM.fileName);
  if (tsmFile === null) {
    state.tsm = null;
    return;
  }
  const scope = selectedRulesetAndFaction();
  state.tsm = window.TSM.readPrices(tsmFile.text, scope.ruleset, scope.faction);
}

async function readLegacyTsmFile(askPermission) {
  const handle = await window.WOW_FOLDER.loadHandle(window.WOW_FOLDER.legacyTsmFileKey);
  if (handle === null || !(await window.WOW_FOLDER.ensureReadPermission(handle, askPermission))) {
    state.tsm = null;
    return;
  }
  const file = await handle.getFile();
  const scope = selectedRulesetAndFaction();
  state.tsm = window.TSM.readPrices(await file.text(), scope.ruleset, scope.faction);
}

function compareAccountFiles(first, second) {
  return first.account.localeCompare(second.account);
}

async function readInventoryFromFolder(folder) {
  const files = await window.WOW_FOLDER.readSavedVariablesFiles(folder, window.TSM.savedVariablesFile);
  if (files.length === 0) {
    state.inventory = null;
    return;
  }
  const characters = {};
  let newest = 0;
  files.sort(compareAccountFiles);
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const accountCharacters = window.TSM.parseInventory(file.text);
    for (const name of Object.keys(accountCharacters)) {
      accountCharacters[name].account = "Account " + (index + 1);
    }
    Object.assign(characters, accountCharacters);
    if (file.modifiedAt > newest) {
      newest = file.modifiedAt;
    }
  }
  state.inventory = { characters: characters, modifiedAt: newest, accountCount: files.length };
}

async function readWowFolder(askPermission) {
  const folder = await window.WOW_FOLDER.loadHandle(window.WOW_FOLDER.folderKey);
  if (folder === null) {
    state.wowFolderConnected = false;
    state.questie = null;
    await readLegacyTsmFile(askPermission);
    return;
  }
  if (!(await window.WOW_FOLDER.ensureReadPermission(folder, askPermission))) {
    state.wowFolderConnected = false;
    return;
  }
  state.wowFolderConnected = true;
  await readQuestieFile(folder);
  await readTsmFromFolder(folder);
  await readInventoryFromFolder(folder);
}

function questieStatusText() {
  if (state.questie === null) {
    return "Questie: not found. Install Questie for item sources.";
  }
  return "Questie " + state.questie.version + ": sources for " + Object.keys(state.questie.items).length + " items.";
}

function inventoryStatusText() {
  if (state.inventory === null) {
    return "Inventory: not found. TSM saves it when a character logs out.";
  }
  return "Inventory: " + Object.keys(state.inventory.characters).length + " characters, saved " + new Date(state.inventory.modifiedAt).toLocaleString() + ".";
}

function tsmStatusText() {
  if (state.tsm === null) {
    return "TSM prices: not found. Install the TSM desktop app for auction prices.";
  }
  let scopeText = "region prices only";
  if (state.tsm.scope !== null) {
    scopeText = state.tsm.scope + " auction house and region prices";
  }
  return "TSM prices: " + scopeText + ", from " + new Date(state.tsm.downloadedAt).toLocaleString() + ".";
}
