import { markRaw, reactive } from "vue";
import "./legacy.ts";
import type { TsmInventoryCharacter } from "./tsm.ts";
import { isVendorSoldFor, preferredOffer, unitCost, vendorDiscountRate } from "./prices.ts";
import { STORAGE_KEYS, readStorage, selectedCharacter, state, writeStorage } from "./state.ts";

export const MAX_RECIPE_DEPTH = 6;
export const INVENTORY_PLACES: ("bags" | "bank" | "mail")[] = ["bags", "bank", "mail"];

export interface Recipe {
  id: number;
  profession: string;
  itemId: number;
  quantity: number;
  reagents: [number, number][];
  teachingItemId?: number;
}

export interface CraftingEntry {
  itemId: number;
  quantity: number;
}

export interface CraftingList {
  entries: CraftingEntry[];
  overrides: Record<string, string>;
  useInventory: boolean;
  excludedCharacters: string[];
  scope: string | null;
  barteringRank: number;
  sharesMaterials: boolean;
}

export interface Offer {
  price: number;
  where: string;
}

export interface PriceScope {
  ruleset: string;
  faction: string;
}

export interface InventoryCharacter extends TsmInventoryCharacter {
  account?: string;
}

export interface Inventory {
  characters: Record<string, InventoryCharacter>;
  modifiedAt: number;
  accountCount: number;
}

export interface Holding {
  character: string;
  place: string;
  count: number;
}

export interface CraftingItem {
  id: number;
  name: string;
  quality: string;
  icon: number | null;
  vendorPrice: number;
}

export interface PlanNode {
  itemId: number;
  quantity: number;
  available: number;
  mode: string;
  taken: Holding[];
  ownUsed: number;
  buyQuantity: number;
  buyOffer: Offer | null;
  craftCount: number;
  recipe: Recipe | null;
  children: PlanNode[];
  cost: number;
  missingPrice: boolean;
  canCraft: boolean;
  vendorTotal: number | null;
  auctionTotal: number | null;
  craftTotal: number | null;
}

export interface Plan {
  entry: CraftingEntry;
  root: PlanNode;
  readyMadeCost: number | null;
}

export interface ShoppingLine {
  itemId: number;
  quantity: number;
  cost: number;
  offer: Offer | null;
}

export interface TakingLine {
  character: string;
  itemId: number;
  places: Record<string, number>;
  count: number;
}

export interface PlanTotals {
  shopping: ShoppingLine[];
  taking: TakingLine[];
  professions: string[];
  total: number;
  missing: boolean;
}

type MarketCost = { cost: number; mode: string } | null;
type StockPool = Map<number, Holding[]>;

export function defaultCraftingList(): CraftingList {
  return { entries: [], overrides: {}, useInventory: true, excludedCharacters: [], scope: null, barteringRank: 0, sharesMaterials: true };
}

export const crafting: { list: CraftingList; recipesByItem: Map<number, Recipe[]>; marketCache: Map<number, MarketCost> } = reactive({
  list: defaultCraftingList(),
  recipesByItem: markRaw(new Map<number, Recipe[]>()),
  marketCache: markRaw(new Map<number, MarketCost>())
}) as { list: CraftingList; recipesByItem: Map<number, Recipe[]>; marketCache: Map<number, MarketCost> };

export function loadCraftingList(): void {
  crafting.list = Object.assign(defaultCraftingList(), readStorage(STORAGE_KEYS.crafting, {}));
  crafting.list.entries = [];
}

export function saveCraftingList(): void {
  const saved: Partial<CraftingList> = Object.assign({}, crafting.list);
  delete saved.entries;
  writeStorage(STORAGE_KEYS.crafting, saved);
}

export function indexRecipes(): void {
  crafting.recipesByItem.clear();
  for (const recipe of window.FOREVER_RECIPES) {
    const recipes = crafting.recipesByItem.get(recipe.itemId) || [];
    recipes.push(recipe);
    crafting.recipesByItem.set(recipe.itemId, recipes);
  }
}

export function inventory(): Inventory | null {
  return state.inventory as Inventory | null;
}

export function craftingItem(itemId: number): CraftingItem {
  const known = window.FOREVER_CRAFTING_ITEMS[itemId];
  if (known) {
    return { id: itemId, name: known.name, quality: known.quality, icon: known.icon, vendorPrice: known.vendorPrice || 0 };
  }
  return { id: itemId, name: "Item " + itemId, quality: "COMMON", icon: null, vendorPrice: 0 };
}

export function isBindOnPickup(itemId: number): boolean {
  const known = window.FOREVER_CRAFTING_ITEMS[itemId];
  return Boolean(known && known.bindOnPickup);
}

export function scopeKey(ruleset: string, faction: string): string {
  return ruleset + "|" + faction;
}

export function availableScopes(): PriceScope[] {
  const scopes = new Map<string, PriceScope>();
  const known = inventory();
  if (known !== null) {
    for (const name of Object.keys(known.characters)) {
      const character = known.characters[name];
      scopes.set(scopeKey(character.ruleset, character.faction), { ruleset: character.ruleset, faction: character.faction });
    }
  }
  for (const character of state.settings.characters) {
    const snapshot = state.snapshots[character.slug];
    if (snapshot && snapshot.ruleset && snapshot.faction) {
      scopes.set(scopeKey(snapshot.ruleset, snapshot.faction), { ruleset: snapshot.ruleset, faction: snapshot.faction });
    }
  }
  return Array.from(scopes.values());
}

export function currentPriceScope(): PriceScope {
  const scopes = availableScopes();
  for (const scope of scopes) {
    if (scopeKey(scope.ruleset, scope.faction) === crafting.list.scope) {
      return scope;
    }
  }
  const character = selectedCharacter();
  if (character !== null && state.snapshots[character.slug]) {
    const snapshot = state.snapshots[character.slug];
    return { ruleset: snapshot.ruleset, faction: snapshot.faction as string };
  }
  if (scopes.length > 0) {
    return scopes[0];
  }
  return { ruleset: "", faction: "" };
}

export function ownFactionLetter(): string {
  if (currentPriceScope().faction === "Alliance") {
    return "A";
  }
  return "H";
}

export function isInScope(ruleset: string, faction: string): boolean {
  const scope = currentPriceScope();
  return ruleset === scope.ruleset && faction === scope.faction;
}

export function vendorOffer(itemId: number): Offer | null {
  const item = craftingItem(itemId);
  if (item.vendorPrice > 0 && isVendorSoldFor(itemId, ownFactionLetter())) {
    return { price: item.vendorPrice * (1 - vendorDiscountRate(crafting.list.barteringRank)), where: "vendor" };
  }
  return null;
}

export function auctionOffer(itemId: number): Offer | null {
  const auctionPrice = unitCost(itemId);
  if (auctionPrice !== null && auctionPrice > 0 && !isBindOnPickup(itemId)) {
    return { price: auctionPrice, where: "auction house" };
  }
  return null;
}

export function buyOffer(itemId: number): Offer | null {
  return preferredOffer(vendorOffer(itemId), auctionOffer(itemId));
}

function offerForMode(itemId: number, mode: string): Offer | null {
  if (mode === "vendor" && vendorOffer(itemId) !== null) {
    return vendorOffer(itemId);
  }
  if (mode === "ah" && auctionOffer(itemId) !== null) {
    return auctionOffer(itemId);
  }
  return buyOffer(itemId);
}

function marketUnitCost(itemId: number, depth: number, path: number[]): MarketCost {
  if (crafting.marketCache.has(itemId)) {
    return crafting.marketCache.get(itemId) || null;
  }
  const offer = buyOffer(itemId);
  let best: MarketCost = null;
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

function cheapestRecipe(itemId: number, depth: number, path: number[]): { recipe: Recipe; unitCost: number } | null {
  const recipes = crafting.recipesByItem.get(itemId);
  if (!recipes || depth >= MAX_RECIPE_DEPTH || path.indexOf(itemId) !== -1) {
    return null;
  }
  const nextPath = path.concat([itemId]);
  let best: { recipe: Recipe; unitCost: number } | null = null;
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

function anyRecipe(itemId: number, depth: number, path: number[]): Recipe | null {
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

export function includedInventoryCharacters(): InventoryCharacter[] {
  const characters: InventoryCharacter[] = [];
  const known = inventory();
  if (known === null || !crafting.list.useInventory) {
    return characters;
  }
  for (const name of Object.keys(known.characters)) {
    const character = known.characters[name];
    if (crafting.list.excludedCharacters.indexOf(name) === -1 && isInScope(character.ruleset, character.faction)) {
      characters.push(character);
    }
  }
  return characters;
}

function createStockPool(): StockPool {
  const pool: StockPool = new Map();
  for (const character of includedInventoryCharacters()) {
    for (const place of INVENTORY_PLACES) {
      for (const itemId of Object.keys(character[place])) {
        const numericId = Number(itemId);
        const holdings = pool.get(numericId) || [];
        holdings.push({ character: character.name, place: place, count: character[place][itemId] });
        pool.set(numericId, holdings);
      }
    }
  }
  return pool;
}

function stockAvailable(pool: StockPool, itemId: number): number {
  let total = 0;
  for (const holding of pool.get(itemId) || []) {
    total += holding.count;
  }
  return total;
}

function takeFromStock(pool: StockPool, itemId: number, quantity: number): Holding[] {
  const taken: Holding[] = [];
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

function remainderMode(itemId: number, depth: number, path: number[]): string {
  const market = marketUnitCost(itemId, depth, path);
  if (market !== null) {
    return market.mode;
  }
  if (anyRecipe(itemId, depth, path) !== null) {
    return "craft";
  }
  return "buy";
}

function defaultMode(itemId: number, available: number, depth: number, path: number[]): string {
  if (available > 0) {
    return "own";
  }
  return remainderMode(itemId, depth, path);
}

function totalFor(offer: Offer | null, quantity: number): number | null {
  if (offer === null) {
    return null;
  }
  return offer.price * quantity;
}

function emptyNode(itemId: number, quantity: number, available: number, mode: string, canCraft: boolean): PlanNode {
  return {
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
    canCraft: canCraft,
    vendorTotal: null,
    auctionTotal: null,
    craftTotal: null
  };
}

function craftRemainder(node: PlanNode, remaining: number, pool: StockPool, depth: number, path: number[]): void {
  const recipe = anyRecipe(node.itemId, depth, path) as Recipe;
  node.recipe = recipe;
  node.craftCount = Math.ceil(remaining / recipe.quantity);
  const nextPath = path.concat([node.itemId]);
  for (const reagent of recipe.reagents) {
    const child = planNode(reagent[0], reagent[1] * node.craftCount, pool, depth + 1, nextPath);
    node.children.push(child);
    node.cost += child.cost;
    node.missingPrice = node.missingPrice || child.missingPrice;
  }
}

function planNode(itemId: number, quantity: number, pool: StockPool, depth: number, path: number[]): PlanNode {
  const available = stockAvailable(pool, itemId);
  let mode = crafting.list.overrides[itemId] || defaultMode(itemId, available, depth, path);
  if (mode === "craft" && anyRecipe(itemId, depth, path) === null) {
    mode = defaultMode(itemId, available, depth, path);
  }
  const node = emptyNode(itemId, quantity, available, mode, anyRecipe(itemId, depth, path) !== null);
  node.vendorTotal = totalFor(vendorOffer(itemId), quantity);
  node.auctionTotal = totalFor(auctionOffer(itemId), quantity);
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
    craftRemainder(node, remaining, pool, depth, path);
    return node;
  }
  node.buyQuantity = remaining;
  node.buyOffer = offerForMode(itemId, howToGetRest);
  if (node.buyOffer === null) {
    node.missingPrice = true;
  } else {
    node.cost = node.buyOffer.price * remaining;
  }
  return node;
}

export function planList(): Plan[] {
  crafting.marketCache.clear();
  const sharedPool = createStockPool();
  const plans: Plan[] = [];
  for (const entry of crafting.list.entries) {
    let pool = sharedPool;
    if (!crafting.list.sharesMaterials) {
      pool = createStockPool();
    }
    const root = planNode(entry.itemId, entry.quantity, pool, 0, []);
    plans.push({ entry: entry, root: root, readyMadeCost: totalFor(buyOffer(entry.itemId), entry.quantity) });
  }
  return plans;
}

export function collectNodes(node: PlanNode, collected: PlanNode[]): PlanNode[] {
  collected.push(node);
  for (const child of node.children) {
    collectNodes(child, collected);
  }
  return collected;
}

export function aggregatePlans(plans: Plan[]): PlanTotals {
  const shopping = new Map<number, ShoppingLine>();
  const taking = new Map<string, TakingLine>();
  const professions = new Set<string>();
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
