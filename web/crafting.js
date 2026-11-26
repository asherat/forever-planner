const MAX_RECIPE_DEPTH = 6;
const CRAFTING_MODES = { own: "Have", buy: "Buy", craft: "Craft" };
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MODE_ICON_PATHS = {
  own: "M5 7h14l-1.2 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 7zm4 0V6a3 3 0 0 1 6 0v1",
  buy: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zm-8 3v4c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 4v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4m-16 4v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4",
  craft: "M14.5 4.5l5 5-2 2-1.5-1.5-8.5 8.5a1.8 1.8 0 0 1-2.5-2.5L13.5 7.5 12 6l2.5-1.5z"
};
const PLACE_LABELS = { bags: "bags", bank: "bank", mail: "mailbox", auctions: "on the AH" };
const INVENTORY_PLACES = ["bags", "bank", "mail"];

const crafting = {
  list: null,
  recipesByItem: new Map(),
  marketCache: new Map()
};

function defaultCraftingList() {
  return { entries: [], overrides: {}, useInventory: true, excludedCharacters: [], scope: null };
}

function loadCraftingList() {
  crafting.list = Object.assign(defaultCraftingList(), readStorage(STORAGE_KEYS.crafting, {}));
  crafting.list.entries = [];
}

function saveCraftingList() {
  const saved = Object.assign({}, crafting.list);
  delete saved.entries;
  writeStorage(STORAGE_KEYS.crafting, saved);
}

function indexRecipes() {
  for (const recipe of window.FOREVER_RECIPES) {
    if (!crafting.recipesByItem.has(recipe.itemId)) {
      crafting.recipesByItem.set(recipe.itemId, []);
    }
    crafting.recipesByItem.get(recipe.itemId).push(recipe);
  }
}

function questieItemIds() {
  const itemIds = [];
  for (const itemId of Object.keys(window.FOREVER_CRAFTING_ITEMS)) {
    itemIds.push(Number(itemId));
  }
  return itemIds;
}

function questieQuestIds() {
  return [];
}

function craftingItem(itemId) {
  const known = window.FOREVER_CRAFTING_ITEMS[itemId];
  if (known) {
    return { id: itemId, name: known.name, quality: known.quality, icon: known.icon, vendorPrice: known.vendorPrice };
  }
  return { id: itemId, name: "Item " + itemId, quality: "COMMON", icon: null, vendorPrice: 0 };
}

function isBindOnPickup(itemId) {
  const known = window.FOREVER_CRAFTING_ITEMS[itemId];
  return Boolean(known && known.bindOnPickup);
}

function ownFactionLetter() {
  if (currentPriceScope().faction === "Alliance") {
    return "A";
  }
  return "H";
}

function scopeKey(ruleset, faction) {
  return ruleset + "|" + faction;
}

function availableScopes() {
  const scopes = new Map();
  if (state.inventory !== null) {
    for (const name of Object.keys(state.inventory.characters)) {
      const character = state.inventory.characters[name];
      scopes.set(scopeKey(character.ruleset, character.faction), { ruleset: character.ruleset, faction: character.faction });
    }
  }
  for (const slug of Object.keys(state.snapshots)) {
    const snapshot = state.snapshots[slug];
    if (snapshot.ruleset && snapshot.faction) {
      scopes.set(scopeKey(snapshot.ruleset, snapshot.faction), { ruleset: snapshot.ruleset, faction: snapshot.faction });
    }
  }
  return Array.from(scopes.values());
}

function currentPriceScope() {
  const scopes = availableScopes();
  for (const scope of scopes) {
    if (scopeKey(scope.ruleset, scope.faction) === crafting.list.scope) {
      return scope;
    }
  }
  const character = selectedCharacter();
  if (character !== null && state.snapshots[character.slug]) {
    return { ruleset: state.snapshots[character.slug].ruleset, faction: state.snapshots[character.slug].faction };
  }
  if (scopes.length > 0) {
    return scopes[0];
  }
  return { ruleset: "", faction: "" };
}

function isInScope(ruleset, faction) {
  const scope = currentPriceScope();
  return ruleset === scope.ruleset && faction === scope.faction;
}

function isVendorSold(itemId) {
  if (state.questie === null || !state.questie.items[itemId]) {
    return false;
  }
  const letter = ownFactionLetter();
  for (const source of state.questie.items[itemId].sources) {
    if (source.type === "vendor" && (!source.friendlyTo || source.friendlyTo.indexOf(letter) !== -1)) {
      return true;
    }
  }
  return false;
}

function buyOffer(itemId) {
  const offers = [];
  const item = craftingItem(itemId);
  if (item.vendorPrice > 0 && isVendorSold(itemId)) {
    offers.push({ price: item.vendorPrice, where: "vendor" });
  }
  const auctionPrice = unitCost(itemId);
  if (auctionPrice !== null && auctionPrice > 0 && !isBindOnPickup(itemId)) {
    offers.push({ price: auctionPrice, where: "auction house" });
  }
  if (offers.length === 0) {
    return null;
  }
  offers.sort(compareOffers);
  return offers[0];
}

function compareOffers(first, second) {
  return first.price - second.price;
}

function marketUnitCost(itemId, depth, path) {
  if (crafting.marketCache.has(itemId)) {
    return crafting.marketCache.get(itemId);
  }
  const offer = buyOffer(itemId);
  let best = null;
  if (offer !== null) {
    best = { cost: offer.price, mode: "buy" };
  }
  const recipe = cheapestRecipe(itemId, depth, path);
  if (recipe !== null && (best === null || recipe.unitCost < best.cost)) {
    best = { cost: recipe.unitCost, mode: "craft" };
  }
  if (depth === 0) {
    crafting.marketCache.set(itemId, best);
  }
  return best;
}

function cheapestRecipe(itemId, depth, path) {
  const recipes = crafting.recipesByItem.get(itemId);
  if (!recipes || depth >= MAX_RECIPE_DEPTH || path.indexOf(itemId) !== -1) {
    return null;
  }
  const nextPath = path.concat([itemId]);
  let best = null;
  for (const recipe of recipes) {
    let total = 0;
    let complete = true;
    for (const reagent of recipe.reagents) {
      const reagentCost = marketUnitCost(reagent[0], depth + 1, nextPath);
      if (reagentCost === null) {
        complete = false;
        break;
      }
      total += reagentCost.cost * reagent[1];
    }
    if (complete && (best === null || total / recipe.quantity < best.unitCost)) {
      best = { recipe: recipe, unitCost: total / recipe.quantity };
    }
  }
  return best;
}

function anyRecipe(itemId, depth, path) {
  const cheapest = cheapestRecipe(itemId, depth, path);
  if (cheapest !== null) {
    return cheapest.recipe;
  }
  const recipes = crafting.recipesByItem.get(itemId);
  if (!recipes || depth >= MAX_RECIPE_DEPTH || path.indexOf(itemId) !== -1) {
    return null;
  }
  return recipes[0];
}

function includedInventoryCharacters() {
  const characters = [];
  if (state.inventory === null || !crafting.list.useInventory) {
    return characters;
  }
  for (const name of Object.keys(state.inventory.characters)) {
    const character = state.inventory.characters[name];
    if (crafting.list.excludedCharacters.indexOf(name) === -1 && isInScope(character.ruleset, character.faction)) {
      characters.push(character);
    }
  }
  return characters;
}

function createStockPool() {
  const pool = new Map();
  for (const character of includedInventoryCharacters()) {
    for (const place of INVENTORY_PLACES) {
      for (const itemId of Object.keys(character[place])) {
        const numericId = Number(itemId);
        if (!pool.has(numericId)) {
          pool.set(numericId, []);
        }
        pool.get(numericId).push({ character: character.name, place: place, count: character[place][itemId] });
      }
    }
  }
  return pool;
}

function stockAvailable(pool, itemId) {
  let total = 0;
  for (const holding of pool.get(itemId) || []) {
    total += holding.count;
  }
  return total;
}

function takeFromStock(pool, itemId, quantity) {
  const taken = [];
  let remaining = quantity;
  for (const holding of pool.get(itemId) || []) {
    if (remaining === 0) {
      break;
    }
    const amount = Math.min(holding.count, remaining);
    if (amount > 0) {
      holding.count -= amount;
      remaining -= amount;
      taken.push({ character: holding.character, place: holding.place, count: amount });
    }
  }
  return taken;
}

function defaultMode(itemId, available, depth, path) {
  if (available > 0) {
    return "own";
  }
  const market = marketUnitCost(itemId, depth, path);
  if (market !== null) {
    return market.mode;
  }
  if (anyRecipe(itemId, depth, path) !== null) {
    return "craft";
  }
  return "buy";
}

function remainderMode(itemId, depth, path) {
  const market = marketUnitCost(itemId, depth, path);
  if (market !== null) {
    return market.mode;
  }
  if (anyRecipe(itemId, depth, path) !== null) {
    return "craft";
  }
  return "buy";
}

function planNode(itemId, quantity, pool, depth, path) {
  const available = stockAvailable(pool, itemId);
  let mode = crafting.list.overrides[itemId] || defaultMode(itemId, available, depth, path);
  if (mode === "craft" && anyRecipe(itemId, depth, path) === null) {
    mode = defaultMode(itemId, available, depth, path);
  }
  const node = {
    itemId: itemId,
    quantity: quantity,
    available: available,
    mode: mode,
    taken: [],
    ownUsed: 0,
    buyQuantity: 0,
    buyOffer: null,
    craftCount: 0,
    recipe: null,
    children: [],
    cost: 0,
    missingPrice: false,
    canCraft: anyRecipe(itemId, depth, path) !== null,
    canBuy: buyOffer(itemId) !== null,
    buyTotal: null,
    craftTotal: null
  };
  const offer = buyOffer(itemId);
  if (offer !== null) {
    node.buyTotal = offer.price * quantity;
  }
  const cheapest = cheapestRecipe(itemId, depth, path);
  if (cheapest !== null) {
    node.craftTotal = cheapest.unitCost * quantity;
  }
  let remaining = quantity;
  let howToGetRest = mode;
  if (mode === "own") {
    node.ownUsed = Math.min(available, quantity);
    node.taken = takeFromStock(pool, itemId, node.ownUsed);
    remaining = quantity - node.ownUsed;
    howToGetRest = remainderMode(itemId, depth, path);
  }
  if (remaining === 0) {
    return node;
  }
  if (howToGetRest === "craft") {
    const recipe = anyRecipe(itemId, depth, path);
    node.recipe = recipe;
    node.craftCount = Math.ceil(remaining / recipe.quantity);
    const nextPath = path.concat([itemId]);
    for (const reagent of recipe.reagents) {
      const child = planNode(reagent[0], reagent[1] * node.craftCount, pool, depth + 1, nextPath);
      node.children.push(child);
      node.cost += child.cost;
      node.missingPrice = node.missingPrice || child.missingPrice;
    }
    return node;
  }
  node.buyQuantity = remaining;
  node.buyOffer = buyOffer(itemId);
  if (node.buyOffer === null) {
    node.missingPrice = true;
  } else {
    node.cost = node.buyOffer.price * remaining;
  }
  return node;
}

function planList() {
  crafting.marketCache.clear();
  const pool = createStockPool();
  const plans = [];
  for (const entry of crafting.list.entries) {
    const root = planNode(entry.itemId, entry.quantity, pool, 0, []);
    const readyMade = buyOffer(entry.itemId);
    let readyMadeCost = null;
    if (readyMade !== null) {
      readyMadeCost = readyMade.price * entry.quantity;
    }
    plans.push({ entry: entry, root: root, readyMadeCost: readyMadeCost });
  }
  return plans;
}

function collectNodes(node, collected) {
  collected.push(node);
  for (const child of node.children) {
    collectNodes(child, collected);
  }
  return collected;
}

function aggregatePlans(plans) {
  const shopping = new Map();
  const taking = new Map();
  const professions = new Set();
  let total = 0;
  let missing = false;
  for (const plan of plans) {
    total += plan.root.cost;
    missing = missing || plan.root.missingPrice;
    for (const node of collectNodes(plan.root, [])) {
      if (node.buyQuantity > 0) {
        const line = shopping.get(node.itemId) || { itemId: node.itemId, quantity: 0, cost: 0, offer: node.buyOffer };
        line.quantity += node.buyQuantity;
        line.cost += node.cost;
        shopping.set(node.itemId, line);
      }
      for (const taken of node.taken) {
        const key = taken.character + "|" + node.itemId;
        const line = taking.get(key) || { character: taken.character, itemId: node.itemId, places: {}, count: 0 };
        line.count += taken.count;
        line.places[taken.place] = (line.places[taken.place] || 0) + taken.count;
        taking.set(key, line);
      }
      if (node.recipe !== null) {
        professions.add(node.recipe.profession);
      }
    }
  }
  return { shopping: Array.from(shopping.values()), taking: Array.from(taking.values()), professions: Array.from(professions), total: total, missing: missing };
}

function itemLabel(itemId) {
  const item = craftingItem(itemId);
  const label = createElement("span", "crafting-item");
  label.appendChild(itemIcon(item, "icon-small"));
  label.appendChild(wowheadLink(item));
  return label;
}

function moneyOrUnknown(copper, missing) {
  if (missing && copper === 0) {
    return createElement("span", "muted", "no price");
  }
  const wrapper = createElement("span", "crafting-cost");
  wrapper.appendChild(renderMoney(copper));
  if (missing) {
    wrapper.appendChild(createElement("span", "muted", " + unpriced"));
  }
  return wrapper;
}

function renderModeButtons(node) {
  const group = createElement("span", "mode-buttons");
  const modes = [];
  if (node.available > 0) {
    modes.push("own");
  }
  if (node.canBuy) {
    modes.push("buy");
  }
  if (node.canCraft) {
    modes.push("craft");
  }
  for (const mode of modes) {
    const button = createElement("button", "mode-button");
    button.appendChild(modeIcon(mode));
    button.append(CRAFTING_MODES[mode] + " ");
    button.appendChild(modeButtonValue(node, mode));
    button.type = "button";
    button.dataset.modeItemId = String(node.itemId);
    button.dataset.mode = mode;
    button.setAttribute("aria-pressed", String(node.mode === mode));
    group.appendChild(button);
  }
  return group;
}

function modeIcon(mode) {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "mode-icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", MODE_ICON_PATHS[mode]);
  svg.appendChild(path);
  return svg;
}

function modeButtonValue(node, mode) {
  if (mode === "own") {
    return createElement("span", "mode-value", String(node.available));
  }
  let total = node.craftTotal;
  if (mode === "buy") {
    total = node.buyTotal;
  }
  if (total === null) {
    return createElement("span", "mode-value", "?");
  }
  const value = createElement("span", "mode-value");
  value.appendChild(renderMoney(total));
  return value;
}

function nodeExplanation(node) {
  const parts = [];
  if (node.ownUsed > 0) {
    parts.push("use " + node.ownUsed + " you have");
  }
  if (node.craftCount > 0) {
    let craftText = "craft " + node.craftCount + "×";
    if (node.recipe.quantity > 1) {
      craftText += " (makes " + node.recipe.quantity + " each)";
    }
    parts.push(craftText);
  }
  if (node.buyQuantity > 0) {
    if (node.buyOffer === null) {
      parts.push("buy " + node.buyQuantity + ", no price known");
    } else {
      parts.push("buy " + node.buyQuantity + " from the " + node.buyOffer.where);
    }
  }
  if (node.available > 0 && node.ownUsed === 0) {
    parts.push("you have " + node.available);
  }
  return parts.join(" · ");
}

function renderNode(node) {
  const item = createElement("li", "tree-node");
  const row = createElement("div", "tree-row");
  const name = createElement("span", "tree-name");
  name.appendChild(itemLabel(node.itemId));
  name.appendChild(createElement("span", "tree-quantity", "×" + node.quantity));
  row.appendChild(name);
  row.appendChild(renderModeButtons(node));
  row.appendChild(moneyOrUnknown(node.cost, node.missingPrice));
  item.appendChild(row);
  item.appendChild(createElement("div", "tree-explanation muted", nodeExplanation(node)));
  if (node.children.length > 0) {
    const children = createElement("ul", "tree-children");
    for (const child of node.children) {
      children.appendChild(renderNode(child));
    }
    item.appendChild(children);
  }
  return item;
}

function renderVerdict(plan) {
  const verdict = createElement("p", "crafting-verdict");
  verdict.append("Your plan costs ", moneyOrUnknown(plan.root.cost, plan.root.missingPrice));
  if (plan.readyMadeCost === null) {
    verdict.append(". Not for sale ready-made right now.");
    return verdict;
  }
  verdict.append(" · ready-made ", renderMoney(plan.readyMadeCost));
  const difference = plan.readyMadeCost - plan.root.cost;
  if (plan.root.missingPrice) {
    return verdict;
  }
  if (difference > 0) {
    const saving = createElement("strong", "verdict-good");
    saving.append("Crafting saves ", renderMoney(difference));
    verdict.append(" · ", saving);
  } else if (difference < 0) {
    const loss = createElement("strong", "verdict-bad");
    loss.append("Buying it is cheaper by ", renderMoney(-difference));
    verdict.append(" · ", loss);
  }
  return verdict;
}

function charactersKnowingRecipe(recipe) {
  const names = [];
  for (const character of state.settings.characters) {
    const snapshot = state.snapshots[character.slug];
    if (!snapshot || !isInScope(snapshot.ruleset, snapshot.faction)) {
      continue;
    }
    for (const profession of snapshot.professions) {
      if (profession.name === recipe.profession && (profession.recipeIds || []).indexOf(recipe.id) !== -1) {
        names.push(character.displayName);
      }
    }
  }
  return names;
}

function planRequirements(plan) {
  const recipes = new Map();
  const bindOnPickup = new Map();
  for (const node of collectNodes(plan.root, [])) {
    if (node.recipe !== null) {
      recipes.set(node.recipe.id, node);
    }
    if (isBindOnPickup(node.itemId) && node !== plan.root && node.recipe === null && node.buyOffer === null && node.buyQuantity > 0) {
      bindOnPickup.set(node.itemId, (bindOnPickup.get(node.itemId) || 0) + node.buyQuantity);
    }
  }
  return { recipes: Array.from(recipes.values()), bindOnPickup: bindOnPickup };
}

function renderRequirements(plan) {
  const requirements = planRequirements(plan);
  const list = createElement("ul", "requirements");
  for (const node of requirements.recipes) {
    const line = createElement("li", "requirement");
    const knownBy = charactersKnowingRecipe(node.recipe);
    line.append(node.recipe.profession + " recipe: ");
    line.appendChild(itemLabel(node.itemId));
    if (knownBy.length > 0) {
      line.appendChild(createElement("span", "requirement-met", " known by " + knownBy.join(", ")));
    } else {
      line.appendChild(createElement("span", "requirement-missing", " none of your characters knows it yet"));
    }
    list.appendChild(line);
  }
  for (const itemId of requirements.bindOnPickup.keys()) {
    const line = createElement("li", "requirement");
    line.appendChild(itemLabel(itemId));
    line.appendChild(createElement("span", "requirement-missing", " ×" + requirements.bindOnPickup.get(itemId) + " bind on pickup: gather or craft it on the crafting character"));
    list.appendChild(line);
  }
  if (isBindOnPickup(plan.entry.itemId)) {
    const line = createElement("li", "requirement muted");
    line.append("Bind on pickup: the character who crafts it keeps it.");
    list.appendChild(line);
  }
  return list;
}

function renderPlan(plan, index) {
  const entry = createElement("li", "crafting-entry panel");
  const header = createElement("div", "crafting-entry-header");
  const title = createElement("h3", "crafting-entry-title");
  title.appendChild(itemLabel(plan.entry.itemId));
  header.appendChild(title);
  const quantityInput = createElement("input", "crafting-quantity");
  quantityInput.type = "number";
  quantityInput.min = "1";
  quantityInput.value = String(plan.entry.quantity);
  quantityInput.id = "crafting-quantity-" + index;
  quantityInput.dataset.entryIndex = String(index);
  quantityInput.setAttribute("aria-label", "How many");
  header.appendChild(quantityInput);
  const removeButton = createElement("button", "link", "Remove");
  removeButton.type = "button";
  removeButton.dataset.removeEntryIndex = String(index);
  header.appendChild(removeButton);
  entry.appendChild(header);
  entry.appendChild(renderVerdict(plan));
  entry.appendChild(renderRequirements(plan));
  const tree = createElement("ul", "tree");
  tree.appendChild(renderNode(plan.root));
  entry.appendChild(tree);
  return entry;
}

function renderSummaryList(containerId, rows, emptyText) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  if (rows.length === 0) {
    container.appendChild(createElement("li", "muted", emptyText));
    return;
  }
  for (const row of rows) {
    container.appendChild(row);
  }
}

function shoppingRows(shopping) {
  const rows = [];
  for (const line of shopping) {
    const row = createElement("li", "summary-row");
    const label = createElement("span", "summary-label");
    label.appendChild(itemLabel(line.itemId));
    label.append(" ×" + line.quantity);
    row.appendChild(label);
    if (line.offer === null) {
      row.appendChild(createElement("span", "muted", "no price"));
    } else {
      const cost = createElement("span", "summary-value");
      cost.append(renderMoney(line.cost), " " + line.offer.where);
      row.appendChild(cost);
    }
    rows.push(row);
  }
  return rows;
}

function takingRows(taking) {
  const rows = [];
  for (const line of taking) {
    const row = createElement("li", "summary-row");
    const label = createElement("span", "summary-label");
    label.appendChild(itemLabel(line.itemId));
    label.append(" ×" + line.count);
    row.appendChild(label);
    const places = [];
    for (const place of Object.keys(line.places)) {
      places.push(line.places[place] + " in " + PLACE_LABELS[place]);
    }
    row.appendChild(createElement("span", "summary-value muted", line.character + ": " + places.join(", ")));
    rows.push(row);
  }
  return rows;
}

function knownCrafters(profession) {
  const crafters = [];
  if (state.inventory !== null) {
    for (const name of Object.keys(state.inventory.characters)) {
      if (!isInScope(state.inventory.characters[name].ruleset, state.inventory.characters[name].faction)) {
      continue;
    }
    for (const entry of state.inventory.characters[name].professions) {
        if (entry.name === profession) {
          crafters.push({ name: name, level: entry.level });
        }
      }
    }
  }
  for (const character of state.settings.characters) {
    const snapshot = state.snapshots[character.slug];
    if (!snapshot || !isInScope(snapshot.ruleset, snapshot.faction)) {
      continue;
    }
    for (const entry of snapshot.professions) {
      if (entry.name === profession && !crafterListed(crafters, character.displayName)) {
        crafters.push({ name: character.displayName, level: entry.skillPoints });
      }
    }
  }
  return crafters;
}

function crafterListed(crafters, name) {
  for (const crafter of crafters) {
    if (crafter.name === name) {
      return true;
    }
  }
  return false;
}

function crafterRows(professions) {
  const rows = [];
  for (const profession of professions) {
    const row = createElement("li", "summary-row");
    row.appendChild(createElement("span", "summary-label", profession));
    const crafters = knownCrafters(profession);
    const names = [];
    for (const crafter of crafters) {
      if (crafter.level) {
        names.push(crafter.name + " (" + crafter.level + ")");
      } else {
        names.push(crafter.name);
      }
    }
    if (names.length === 0) {
      row.appendChild(createElement("span", "summary-value verdict-bad", "none of your characters"));
    } else {
      row.appendChild(createElement("span", "summary-value", names.join(", ")));
    }
    rows.push(row);
  }
  return rows;
}

function renderInventoryCharacters() {
  document.getElementById("use-inventory").checked = crafting.list.useInventory;
  const container = document.getElementById("inventory-characters");
  container.replaceChildren();
  if (state.inventory === null) {
    container.appendChild(createElement("p", "muted", "Connect your WoW folder to use what your characters have. TSM saves bags and banks when a character logs out."));
    return;
  }
  let currentAccount = null;
  for (const name of Object.keys(state.inventory.characters).sort(compareByAccount)) {
    const character = state.inventory.characters[name];
    if (!isInScope(character.ruleset, character.faction)) {
      continue;
    }
    if (state.inventory.accountCount > 1 && character.account !== currentAccount) {
      currentAccount = character.account;
      container.appendChild(createElement("p", "inventory-account", currentAccount));
    }
    const label = createElement("label", "checkbox-line");
    const checkbox = createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = crafting.list.excludedCharacters.indexOf(name) === -1;
    checkbox.disabled = !crafting.list.useInventory;
    checkbox.dataset.characterName = name;
    label.appendChild(checkbox);
    label.append(" " + name + " ");
    label.appendChild(renderMoney(character.money));
    container.appendChild(label);
  }
}

function compareByAccount(first, second) {
  const firstAccount = state.inventory.characters[first].account;
  const secondAccount = state.inventory.characters[second].account;
  if (firstAccount !== secondAccount) {
    return firstAccount.localeCompare(secondAccount);
  }
  return first.localeCompare(second);
}

function renderDataStatus() {
  const parts = [];
  if (!state.wowFolderConnected) {
    parts.push("Connect your WoW folder for prices, vendor info and your characters' materials.");
  } else {
    parts.push(tsmStatusText(), inventoryStatusText(), questieStatusText());
  }
  document.getElementById("crafting-data-status").textContent = parts.join(" ");
  document.getElementById("crafting-connect-button").hidden = state.wowFolderConnected;
}

function renderScopeSelect() {
  const select = document.getElementById("scope-select");
  select.replaceChildren();
  const scopes = availableScopes();
  const current = currentPriceScope();
  for (const scope of scopes) {
    const option = createElement("option", null, scope.ruleset + " · " + scope.faction);
    option.value = scopeKey(scope.ruleset, scope.faction);
    option.selected = scope.ruleset === current.ruleset && scope.faction === current.faction;
    select.appendChild(option);
  }
  select.hidden = scopes.length < 2;
}

function renderCrafting() {
  renderScopeSelect();
  renderDataStatus();
  renderInventoryCharacters();
  const plans = planList();
  const list = document.getElementById("crafting-list");
  list.replaceChildren();
  for (let index = 0; index < plans.length; index += 1) {
    list.appendChild(renderPlan(plans[index], index));
  }
  document.getElementById("crafting-empty").hidden = plans.length > 0;
  const summary = aggregatePlans(plans);
  const total = document.getElementById("crafting-total");
  total.replaceChildren();
  total.append("Gold you'll spend: ", moneyOrUnknown(summary.total, summary.missing));
  renderSummaryList("shopping-list", shoppingRows(summary.shopping), "Nothing to buy.");
  renderSummaryList("take-list", takingRows(summary.taking), "Nothing taken from your characters.");
  renderSummaryList("crafter-list", crafterRows(summary.professions), "Nothing to craft.");
}

function fillSearchOptions() {
  const datalist = document.getElementById("crafting-search-options");
  const seen = new Set();
  for (const recipe of window.FOREVER_RECIPES) {
    const name = craftingItem(recipe.itemId).name;
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const option = createElement("option");
    option.value = name;
    datalist.appendChild(option);
  }
}

function craftableItemByName(name) {
  const wanted = name.trim().toLowerCase();
  for (const recipe of window.FOREVER_RECIPES) {
    if (craftingItem(recipe.itemId).name.toLowerCase() === wanted) {
      return recipe.itemId;
    }
  }
  return null;
}

function addEntry(itemId, quantity) {
  for (const entry of crafting.list.entries) {
    if (entry.itemId === itemId) {
      entry.quantity += quantity;
      saveCraftingList();
      return;
    }
  }
  crafting.list.entries.push({ itemId: itemId, quantity: quantity });
  saveCraftingList();
}

function handleAddClick() {
  const searchInput = document.getElementById("crafting-search");
  const itemId = craftableItemByName(searchInput.value);
  if (itemId === null) {
    setStatus("No recipe makes \"" + searchInput.value + "\". Pick a name from the suggestions.", "error");
    return;
  }
  const quantity = Math.max(1, Number(document.getElementById("crafting-search-quantity").value) || 1);
  addEntry(itemId, quantity);
  searchInput.value = "";
  setStatus("Added " + craftingItem(itemId).name + ".", "success");
  renderCrafting();
}

function handleListClick(event) {
  const target = event.target;
  if (target.dataset.modeItemId !== undefined) {
    crafting.list.overrides[Number(target.dataset.modeItemId)] = target.dataset.mode;
    saveCraftingList();
    renderCrafting();
    return;
  }
  if (target.dataset.removeEntryIndex !== undefined) {
    crafting.list.entries.splice(Number(target.dataset.removeEntryIndex), 1);
    saveCraftingList();
    renderCrafting();
  }
}

function handleListChange(event) {
  const target = event.target;
  if (target.dataset.entryIndex === undefined) {
    return;
  }
  const quantity = Math.max(1, Number(target.value) || 1);
  crafting.list.entries[Number(target.dataset.entryIndex)].quantity = quantity;
  saveCraftingList();
  renderCrafting();
}

function handleInventoryChange(event) {
  const target = event.target;
  if (target.id === "use-inventory") {
    crafting.list.useInventory = target.checked;
  } else if (target.dataset.characterName !== undefined) {
    const name = target.dataset.characterName;
    const remaining = [];
    for (const excluded of crafting.list.excludedCharacters) {
      if (excluded !== name) {
        remaining.push(excluded);
      }
    }
    if (!target.checked) {
      remaining.push(name);
    }
    crafting.list.excludedCharacters = remaining;
  }
  saveCraftingList();
  renderCrafting();
}

async function handleCraftingRefresh() {
  const button = document.getElementById("crafting-refresh-button");
  button.disabled = true;
  try {
    setStatus("Reading your WoW folder…", "info");
    await readWowFolder(true);
    setStatus("Prices and bags updated.", "success");
    renderCrafting();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function handleCraftingConnect() {
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
    await handleCraftingRefresh();
  } catch (error) {
    if (error.name !== "AbortError") {
      setStatus(error.message, "error");
    }
  }
}

function handleScopeChange(event) {
  crafting.list.scope = event.target.value;
  saveCraftingList();
  handleCraftingRefresh();
}

function handleSearchKeydown(event) {
  if (event.key === "Enter") {
    handleAddClick();
  }
}

function addFromLocationHash() {
  const match = /^#items=([\d:,]+)$/.exec(window.location.hash);
  if (match === null) {
    return;
  }
  const entries = [];
  for (const part of match[1].split(",")) {
    const pieces = part.split(":");
    const itemId = Number(pieces[0]);
    if (itemId > 0) {
      entries.push({ itemId: itemId, quantity: Math.max(1, Number(pieces[1]) || 1) });
    }
  }
  crafting.list.entries = entries;
  history.replaceState(null, "", window.location.pathname);
  setStatus("Loaded " + entries.length + " items from your crafting list.", "success");
}

function handleCraftingStartupError(error) {
  setStatus("Could not read your WoW folder: " + error.message, "error");
}

function bindCraftingEvents() {
  document.getElementById("crafting-add-button").addEventListener("click", handleAddClick);
  document.getElementById("crafting-search").addEventListener("keydown", handleSearchKeydown);
  document.getElementById("crafting-list").addEventListener("click", handleListClick);
  document.getElementById("crafting-list").addEventListener("change", handleListChange);
  document.querySelector(".crafting-summary").addEventListener("change", handleInventoryChange);
  document.getElementById("crafting-refresh-button").addEventListener("click", handleCraftingRefresh);
  document.getElementById("crafting-connect-button").addEventListener("click", handleCraftingConnect);
  document.getElementById("scope-select").addEventListener("change", handleScopeChange);
  window.addEventListener("hashchange", handleHashChange);
}

function handleHashChange() {
  addFromLocationHash();
  renderCrafting();
}

function startCrafting() {
  loadState();
  loadCraftingList();
  indexRecipes();
  fillSearchOptions();
  bindCraftingEvents();
  addFromLocationHash();
  renderCrafting();
  readWowFolder(false).then(renderCrafting).catch(handleCraftingStartupError);
}

startCrafting();
