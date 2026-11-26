const STORAGE_KEYS = {
  credentials: "foreverPlanner.credentials",
  settings: "foreverPlanner.settings",
  snapshots: "foreverPlanner.snapshots",
  tooltipRequirements: "foreverPlanner.tooltipRequirements",
  crafting: "foreverPlanner.crafting",
  craftingCart: "foreverPlanner.craftingCart"
};

const DEFAULT_LOOKAHEAD_LEVELS = 3;
const SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
const MAP_WIDTH = 300;
const MAP_OVERVIEW_PADDING = 0.04;
const MAP_CLOSE_UP_PADDING = 0.6;
const MAP_POPOVER_GAP = 8;
const REGIONS = ["eu", "us", "kr", "tw"];
const BARTERING_DISCOUNT_PER_RANK = 0.05;
const VENDOR_PREFERENCE_MARGIN = 0.15;
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
  wowFolderConnected: false,
  folderErrors: {}
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
  state.tooltipRequirements = readStorage(STORAGE_KEYS.tooltipRequirements, {});
  state.craftingCart = readStorage(STORAGE_KEYS.craftingCart, []);
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
  const region = state.settings.region;
  if (REGIONS.indexOf(region) === -1) {
    throw new Error("Unknown region \"" + region + "\". Pick a region in Settings.");
  }
  const token = await fetchAccessToken();
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
    part.setAttribute("aria-hidden", "true");
    part.appendChild(createElement("span", "coin coin-" + amount.coin));
    money.appendChild(part);
    shown += 1;
  }
  money.appendChild(createElement("span", "visually-hidden", formatMoney(rounded)));
  return money;
}

function isVendorSoldFor(itemId, factionLetter) {
  if (state.questie === null || !state.questie.items[itemId]) {
    return false;
  }
  for (const source of state.questie.items[itemId].sources) {
    if (source.type === "vendor" && (!source.friendlyTo || source.friendlyTo.indexOf(factionLetter) !== -1)) {
      return true;
    }
  }
  return false;
}

function vendorDiscountRate() {
  const rank = Number(readStorage(STORAGE_KEYS.crafting, {}).barteringRank) || 0;
  return rank * BARTERING_DISCOUNT_PER_RANK;
}

function preferredOffer(vendorOffer, auctionOffer) {
  if (vendorOffer === null) {
    return auctionOffer;
  }
  if (auctionOffer === null || auctionOffer.price >= vendorOffer.price * (1 - VENDOR_PREFERENCE_MARGIN)) {
    return vendorOffer;
  }
  return auctionOffer;
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

async function readQuestieFile(folder) {
  const questieFile = await window.WOW_FOLDER.readAddonFile(folder, window.QUESTIE.addonName, window.QUESTIE.fileName);
  if (questieFile === null) {
    state.questie = null;
    return;
  }
  if (state.questie !== null && state.questie.modifiedAt === questieFile.modifiedAt) {
    return;
  }
  const details = window.QUESTIE.buildDetails(questieFile.text, questieItemIds(), window.FOREVER_ZONES, questieQuestIds());
  details.modifiedAt = questieFile.modifiedAt;
  details.dungeonEntrances = {};
  const dungeonFile = await window.WOW_FOLDER.readAddonFile(folder, window.QUESTIE.addonName, window.QUESTIE.dungeonFile);
  if (dungeonFile !== null) {
    details.dungeonEntrances = window.QUESTIE.parseDungeonEntrances(dungeonFile.text, window.FOREVER_ZONES);
  }
  state.questie = details;
}

async function readTsmFromFolder(folder) {
  const tsmFile = await window.WOW_FOLDER.readAddonFile(folder, window.TSM.addonName, window.TSM.fileName);
  if (tsmFile === null) {
    state.tsm = null;
    return;
  }
  const scope = currentPriceScope();
  state.tsm = window.TSM.readPrices(tsmFile.text, scope.ruleset, scope.faction);
}

async function readLegacyTsmFile(askPermission) {
  const handle = await window.WOW_FOLDER.loadHandle(window.WOW_FOLDER.legacyTsmFileKey);
  if (handle === null || !(await window.WOW_FOLDER.ensureReadPermission(handle, askPermission))) {
    state.tsm = null;
    return;
  }
  const file = await handle.getFile();
  const scope = currentPriceScope();
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
  state.folderErrors = {};
  await readFolderSource("questie", readQuestieFile, folder);
  await readFolderSource("tsm", readTsmFromFolder, folder);
  await readFolderSource("inventory", readInventoryFromFolder, folder);
}

async function readFolderSource(sourceKey, reader, folder) {
  try {
    await reader(folder);
  } catch (error) {
    state.folderErrors[sourceKey] = error.message;
    if (sourceKey === "questie") {
      state.questie = null;
    } else if (sourceKey === "tsm") {
      state.tsm = null;
    } else {
      state.inventory = null;
    }
  }
}

function folderErrorText(sourceKey) {
  if (state.folderErrors && state.folderErrors[sourceKey]) {
    return " (could not read it: " + state.folderErrors[sourceKey] + ")";
  }
  return "";
}

function questieStatusText() {
  if (state.questie === null) {
    return "Questie: not found. Install Questie for item sources." + folderErrorText("questie");
  }
  return "Questie " + state.questie.version + ": sources for " + Object.keys(state.questie.items).length + " items.";
}

function inventoryStatusText() {
  if (state.inventory === null) {
    return "Inventory: not found. TSM saves it when a character logs out." + folderErrorText("inventory");
  }
  return "Inventory: " + Object.keys(state.inventory.characters).length + " characters, saved " + new Date(state.inventory.modifiedAt).toLocaleString() + ".";
}

function tsmStatusText() {
  if (state.tsm === null) {
    return "TSM prices: not found. Install the TSM desktop app for auction prices." + folderErrorText("tsm");
  }
  let scopeText = "region prices only";
  if (state.tsm.scope !== null) {
    scopeText = state.tsm.scope + " auction house and region prices";
  }
  return "TSM prices: " + scopeText + ", from " + new Date(state.tsm.downloadedAt).toLocaleString() + ".";
}

function svgElement(tagName, attributes) {
  const element = document.createElementNS(SVG_NAMESPACE_URI, tagName);
  for (const name of Object.keys(attributes)) {
    element.setAttribute(name, String(attributes[name]));
  }
  return element;
}

function mapZone(zoneName) {
  if (!window.FOREVER_MAPS || !zoneName) {
    return null;
  }
  return window.FOREVER_MAPS.zones[zoneName] || null;
}

function continentBounds(continent) {
  const bounds = { left: 1, top: 1, right: 0, bottom: 0 };
  for (const name of Object.keys(window.FOREVER_MAPS.zones)) {
    const zone = window.FOREVER_MAPS.zones[name];
    if (zone.continent !== continent) {
      continue;
    }
    bounds.left = Math.min(bounds.left, zone.rectangle[0]);
    bounds.top = Math.min(bounds.top, zone.rectangle[1]);
    bounds.right = Math.max(bounds.right, zone.rectangle[2]);
    bounds.bottom = Math.max(bounds.bottom, zone.rectangle[3]);
  }
  return padBounds(bounds, MAP_OVERVIEW_PADDING);
}

function padBounds(bounds, padding) {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  return {
    left: bounds.left - width * padding,
    top: bounds.top - height * padding,
    right: bounds.right + width * padding,
    bottom: bounds.bottom + height * padding
  };
}

function closeUpBounds(zone) {
  const rectangle = zone.rectangle;
  const bounds = { left: rectangle[0], top: rectangle[1], right: rectangle[2], bottom: rectangle[3] };
  return padBounds(bounds, MAP_CLOSE_UP_PADDING);
}

function rectanglesOverlap(rectangle, bounds) {
  return rectangle[0] < bounds.right && rectangle[2] > bounds.left && rectangle[1] < bounds.bottom && rectangle[3] > bounds.top;
}

function compareCurrentZoneLast(currentZone, first, second) {
  return Number(first === currentZone) - Number(second === currentZone);
}

function renderMapView(zoneName, pins, bounds, showLabels, className) {
  const zone = mapZone(zoneName);
  const aspectRatio = window.FOREVER_MAPS.continents[zone.continent].aspectRatio;
  const viewWidth = MAP_WIDTH;
  const scaleX = viewWidth / (bounds.right - bounds.left);
  const scaleY = scaleX / aspectRatio;
  const viewHeight = (bounds.bottom - bounds.top) * scaleY;
  const svg = svgElement("svg", { viewBox: "0 0 " + viewWidth + " " + Math.round(viewHeight), class: className });
  svg.setAttribute("aria-hidden", "true");
  svg.appendChild(svgElement("rect", { x: 0, y: 0, width: viewWidth, height: viewHeight, class: "map-sea" }));
  const labels = [];
  const names = Object.keys(window.FOREVER_MAPS.zones);
  names.sort(compareCurrentZoneLast.bind(null, zoneName));
  for (const name of names) {
    const other = window.FOREVER_MAPS.zones[name];
    if (other.continent !== zone.continent || !rectanglesOverlap(other.rectangle, bounds)) {
      continue;
    }
    const rectangle = other.rectangle;
    const box = {
      x: (rectangle[0] - bounds.left) * scaleX,
      y: (rectangle[1] - bounds.top) * scaleY,
      width: (rectangle[2] - rectangle[0]) * scaleX,
      height: (rectangle[3] - rectangle[1]) * scaleY
    };
    let zoneClass = "map-zone";
    if (name === zoneName) {
      zoneClass = "map-zone map-zone-current";
    }
    svg.appendChild(svgElement("rect", { x: box.x, y: box.y, width: box.width, height: box.height, class: zoneClass }));
    if (showLabels || name === zoneName) {
      labels.push({ name: name, box: box, current: name === zoneName });
    }
  }
  for (const label of labels) {
    let labelClass = "map-label";
    if (label.current) {
      labelClass = "map-label map-label-current";
    }
    const text = svgElement("text", { x: label.box.x + label.box.width / 2, y: label.box.y + label.box.height / 2, class: labelClass });
    text.textContent = label.name;
    svg.appendChild(text);
  }
  for (const pin of pins) {
    const rectangle = zone.rectangle;
    const pointX = (rectangle[0] + (rectangle[2] - rectangle[0]) * pin.x / 100 - bounds.left) * scaleX;
    const pointY = (rectangle[1] + (rectangle[3] - rectangle[1]) * pin.y / 100 - bounds.top) * scaleY;
    svg.appendChild(svgElement("circle", { cx: pointX, cy: pointY, r: 7, class: "map-pin-halo" }));
    svg.appendChild(svgElement("circle", { cx: pointX, cy: pointY, r: 3.5, class: "map-pin" }));
  }
  return svg;
}

function renderContinentMap(zoneName, pins) {
  const zone = mapZone(zoneName);
  if (zone === null) {
    return null;
  }
  const container = createElement("div", "map-views");
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", zoneName + " on the map of " + zone.continent);
  container.appendChild(renderMapView(zoneName, [], continentBounds(zone.continent), false, "continent-map map-overview"));
  container.appendChild(renderMapView(zoneName, pins, closeUpBounds(zone), true, "continent-map map-close-up"));
  return container;
}

function readMapTarget(element) {
  const pins = [];
  if (element.dataset.mapX !== undefined && element.dataset.mapX !== "") {
    pins.push({ x: Number(element.dataset.mapX), y: Number(element.dataset.mapY) });
  }
  if (element.dataset.mapPins) {
    for (const pin of JSON.parse(element.dataset.mapPins)) {
      pins.push(pin);
    }
  }
  return { zone: element.dataset.mapZone, pins: pins, caption: element.dataset.mapCaption || element.dataset.mapZone };
}

function mapPopover() {
  let popover = document.getElementById("map-popover");
  if (popover === null) {
    popover = createElement("div", "map-popover");
    popover.id = "map-popover";
    popover.hidden = true;
    document.body.appendChild(popover);
  }
  return popover;
}

function showMapFor(element) {
  const target = readMapTarget(element);
  const map = renderContinentMap(target.zone, target.pins);
  if (map === null) {
    return;
  }
  const popover = mapPopover();
  popover.replaceChildren(map, createElement("div", "map-caption", target.caption));
  popover.hidden = false;
  const anchor = element.getBoundingClientRect();
  const box = popover.getBoundingClientRect();
  let left = anchor.left;
  if (left + box.width > window.innerWidth - MAP_POPOVER_GAP) {
    left = window.innerWidth - box.width - MAP_POPOVER_GAP;
  }
  let top = anchor.bottom + MAP_POPOVER_GAP;
  if (top + box.height > window.innerHeight - MAP_POPOVER_GAP) {
    top = anchor.top - box.height - MAP_POPOVER_GAP;
  }
  popover.style.left = Math.max(MAP_POPOVER_GAP, left) + "px";
  popover.style.top = Math.max(MAP_POPOVER_GAP, top) + "px";
}

function hideMap() {
  mapPopover().hidden = true;
}

function handleMapPointerOver(event) {
  const element = event.target.closest("[data-map-zone]");
  if (element !== null) {
    showMapFor(element);
  }
}

function handleMapPointerOut(event) {
  const element = event.target.closest("[data-map-zone]");
  if (element !== null && !element.contains(event.relatedTarget)) {
    hideMap();
  }
}

function enableMapPopovers() {
  document.addEventListener("mouseover", handleMapPointerOver);
  document.addEventListener("mouseout", handleMapPointerOut);
  document.addEventListener("focusin", handleMapPointerOver);
  document.addEventListener("focusout", handleMapPointerOut);
}

function setMapTarget(element, zoneName, x, y, caption) {
  if (mapZone(zoneName) === null) {
    return;
  }
  element.dataset.mapZone = zoneName;
  if (x !== null && x !== undefined) {
    element.dataset.mapX = String(x);
    element.dataset.mapY = String(y);
  }
  if (caption) {
    element.dataset.mapCaption = caption;
  }
  element.classList.add("has-map");
}

function dungeonEntrance(dungeonName) {
  if (state.questie === null || !state.questie.dungeonEntrances || !dungeonName) {
    return null;
  }
  const entrances = state.questie.dungeonEntrances;
  if (entrances[dungeonName]) {
    return entrances[dungeonName];
  }
  for (const name of Object.keys(entrances)) {
    if (name.startsWith(dungeonName + ":")) {
      return entrances[name];
    }
  }
  return null;
}

function dungeonParentZone(dungeonName) {
  if (!window.ZONE_GUIDE) {
    return null;
  }
  for (const zone of window.ZONE_GUIDE.zones) {
    for (const dungeon of zone.dungeons || []) {
      if (dungeon.name === dungeonName) {
        return zone.name;
      }
    }
  }
  return null;
}

function placeForSource(source) {
  const entrance = dungeonEntrance(source.zone);
  if (entrance !== null) {
    return { zone: entrance.zone, x: entrance.x, y: entrance.y, caption: source.zone + " entrance, " + entrance.zone + " (" + entrance.x.toFixed(1) + ", " + entrance.y.toFixed(1) + ")" };
  }
  const parentZone = dungeonParentZone(source.zone);
  if (parentZone !== null) {
    return { zone: parentZone, x: null, y: null, caption: source.zone + " is in " + parentZone + " (entrance not mapped yet)" };
  }
  let who = "";
  if (source.npc) {
    who = source.npc + ", ";
  }
  if (source.x === null || source.x === undefined) {
    return { zone: source.zone, x: null, y: null, caption: who + source.zone };
  }
  return { zone: source.zone, x: source.x, y: source.y, caption: who + source.zone + " (" + source.x.toFixed(1) + ", " + source.y.toFixed(1) + ")" };
}
