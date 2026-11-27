import { ref } from "vue";
import "../legacy.ts";
import { availableScopes, collectNodes, crafting, craftingItem, currentPriceScope, inventory, isBindOnPickup, isInScope, ownFactionLetter, saveCraftingList, scopeKey } from "../crafting-plan.ts";
import type { CraftingEntry, Plan, PlanNode, Recipe, ShoppingLine, TakingLine } from "../crafting-plan.ts";
import type { ItemSource } from "../types.ts";
import { mapTargetAttributes } from "./map-target.ts";
import type { MapAttributes } from "./map-target.ts";
import { inventoryStatusText, questieStatusText, readWowFolder, tsmStatusText } from "../folder-data.ts";
import { placeForSource } from "../map-popover.ts";
import { WOWHEAD_URL } from "../prices.ts";
import { selectedCharacter, setStatus, state } from "../state.ts";
import type { PlanPick } from "./gear-plan.ts";
import { WOW_FOLDER } from "../wow-folder.ts";

const RECIPE_SOURCES_SHOWN = 2;
const CRAFTING_MODES: Record<string, string> = { own: "Have", vendor: "Vendor", ah: "AH", craft: "Craft" };
const MODE_ICON_PATHS: Record<string, string> = {
  own: "M5 7h14l-1.2 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 7zm4 0V6a3 3 0 0 1 6 0v1",
  vendor: "M3 9l2-5h14l2 5M3 9h18M3 9v1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9M5 13v7h14v-7M10 20v-4h4v4",
  ah: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zm-8 3v4c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 4v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4m-16 4v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4",
  craft: "M14.5 4.5l5 5-2 2-1.5-1.5-8.5 8.5a1.8 1.8 0 0 1-2.5-2.5L13.5 7.5 12 6l2.5-1.5z"
};
const PLACE_LABELS: Record<string, string> = { bags: "bags", bank: "bank", mail: "mailbox", auctions: "on the AH" };

export const isReading = ref(false);

export interface ModeChoice {
  mode: string;
  label: string;
  iconPath: string;
  pressed: boolean;
  showsMoney: boolean;
  copper: number;
  text: string;
}

function pressedMode(node: PlanNode): string {
  if (node.mode === "own" || node.mode === "craft") {
    return node.mode;
  }
  if (node.buyOffer !== null && node.buyOffer.where === "vendor") {
    return "vendor";
  }
  return "ah";
}

function modeTotal(node: PlanNode, mode: string): number | null {
  if (mode === "vendor") {
    return node.vendorTotal;
  }
  if (mode === "ah") {
    return node.auctionTotal;
  }
  return node.craftTotal;
}

function modeChoice(node: PlanNode, mode: string): ModeChoice {
  const choice: ModeChoice = { mode: mode, label: CRAFTING_MODES[mode] + " ", iconPath: MODE_ICON_PATHS[mode], pressed: pressedMode(node) === mode, showsMoney: false, copper: 0, text: "" };
  if (mode === "own") {
    choice.text = String(node.available);
    return choice;
  }
  const total = modeTotal(node, mode);
  if (total === null) {
    choice.text = "?";
  } else {
    choice.showsMoney = true;
    choice.copper = total;
  }
  return choice;
}

export function modeChoices(node: PlanNode): ModeChoice[] {
  const modes: string[] = [];
  if (node.available > 0) {
    modes.push("own");
  }
  if (node.vendorTotal !== null) {
    modes.push("vendor");
  }
  if (node.auctionTotal !== null) {
    modes.push("ah");
  }
  if (node.canCraft) {
    modes.push("craft");
  }
  return modes.map(function choiceFor(mode) {
    return modeChoice(node, mode);
  });
}

export function nodeExplanation(node: PlanNode): string {
  const parts: string[] = [];
  if (node.ownUsed > 0) {
    parts.push("use " + node.ownUsed + " you have");
  }
  if (node.craftCount > 0 && node.recipe !== null) {
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

export interface Verdict {
  readyMade: number | null;
  saving: number;
  loss: number;
}

export function planVerdict(plan: Plan): Verdict {
  const verdict: Verdict = { readyMade: plan.readyMadeCost, saving: 0, loss: 0 };
  if (plan.readyMadeCost === null || plan.root.missingPrice) {
    return verdict;
  }
  const difference = plan.readyMadeCost - plan.root.cost;
  if (difference > 0) {
    verdict.saving = difference;
  } else if (difference < 0) {
    verdict.loss = -difference;
  }
  return verdict;
}

function charactersKnowingRecipe(recipe: Recipe): string[] {
  const names: string[] = [];
  for (const character of state.settings.characters) {
    const snapshot = state.snapshots[character.slug];
    if (!snapshot || !isInScope(snapshot.ruleset, snapshot.faction as string)) {
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

function teachingSources(itemId: number): ItemSource[] {
  if (state.questie === null || !state.questie.items[itemId]) {
    return [];
  }
  const letter = ownFactionLetter();
  const sources: ItemSource[] = [];
  for (const source of state.questie.items[itemId].sources) {
    if (source.type === "vendor" && source.friendlyTo && (source.friendlyTo as string).indexOf(letter) === -1) {
      continue;
    }
    sources.push(source);
  }
  return sources;
}

export interface RecipeSourceLine {
  key: number;
  prefix: string;
  npcUrl: string;
  npcName: string;
  suffix: string;
  coordinates: string;
  mapAttributes: MapAttributes;
  classes: string;
}

function recipeSourceText(teachingName: string, source: ItemSource): string {
  if (source.type === "world-drop") {
    return teachingName + ": world drop";
  }
  return teachingName + ": " + source.type + " in " + (source.zone || "an unknown place");
}

function sourceLine(teachingName: string, source: ItemSource, index: number): RecipeSourceLine {
  const line: RecipeSourceLine = { key: index, prefix: "", npcUrl: "", npcName: "", suffix: "", coordinates: "", mapAttributes: {}, classes: "recipe-source-line" };
  if (source.type === "vendor" || source.type === "drop") {
    let verb = ": drops from ";
    if (source.type === "vendor") {
      verb = ": sold by ";
    }
    line.prefix = teachingName + verb;
    line.npcUrl = WOWHEAD_URL + "npc=" + source.npcId;
    line.npcName = source.npc as string;
    line.suffix = " in " + source.zone;
  } else {
    line.prefix = recipeSourceText(teachingName, source);
  }
  const place = placeForSource(source as unknown as { zone: string; x: number | null; y: number | null });
  if (place.x !== null && place.y !== null) {
    line.coordinates = " (" + place.x.toFixed(1) + ", " + place.y.toFixed(1) + ")";
  }
  line.mapAttributes = mapTargetAttributes(place.zone, place.x, place.y, place.caption);
  if (line.mapAttributes["data-map-zone"] !== undefined) {
    line.classes = "recipe-source-line has-map";
  }
  return line;
}

export interface RecipeSourceView {
  text: string;
  lines: RecipeSourceLine[];
}

export function recipeSource(recipe: Recipe): RecipeSourceView {
  if (!recipe.teachingItemId) {
    return { text: "Learned from a " + recipe.profession + " trainer.", lines: [] };
  }
  const teachingName = craftingItem(recipe.teachingItemId).name;
  const sources = teachingSources(recipe.teachingItemId);
  if (sources.length === 0) {
    return { text: teachingName + ": source unknown. Check the auction house.", lines: [] };
  }
  return {
    text: "",
    lines: sources.slice(0, RECIPE_SOURCES_SHOWN).map(function lineFor(source, index) {
      return sourceLine(teachingName, source, index);
    })
  };
}

export interface RecipeRequirement {
  key: string;
  profession: string;
  itemId: number;
  knownBy: string;
  source: RecipeSourceView | null;
}

export interface BindOnPickupRequirement {
  key: string;
  itemId: number;
  text: string;
}

export interface Requirements {
  recipes: RecipeRequirement[];
  bindOnPickup: BindOnPickupRequirement[];
  craftedIsBindOnPickup: boolean;
}

function isUnbuyableBindOnPickup(node: PlanNode, plan: Plan): boolean {
  return isBindOnPickup(node.itemId) && node !== plan.root && node.recipe === null && node.buyOffer === null && node.buyQuantity > 0;
}

export function planRequirements(plan: Plan): Requirements {
  const recipes = new Map<number, PlanNode>();
  const bindOnPickup = new Map<number, number>();
  for (const node of collectNodes(plan.root, [])) {
    if (node.recipe !== null) {
      recipes.set(node.recipe.id, node);
    }
    if (isUnbuyableBindOnPickup(node, plan)) {
      bindOnPickup.set(node.itemId, (bindOnPickup.get(node.itemId) || 0) + node.buyQuantity);
    }
  }
  const recipeRows: RecipeRequirement[] = [];
  for (const node of recipes.values()) {
    const recipe = node.recipe as Recipe;
    const knownBy = charactersKnowingRecipe(recipe);
    let source: RecipeSourceView | null = null;
    if (knownBy.length === 0) {
      source = recipeSource(recipe);
    }
    recipeRows.push({ key: "recipe-" + recipe.id, profession: recipe.profession + " recipe: ", itemId: node.itemId, knownBy: knownBy.join(", "), source: source });
  }
  const bindRows: BindOnPickupRequirement[] = [];
  for (const itemId of bindOnPickup.keys()) {
    bindRows.push({ key: "bind-" + itemId, itemId: itemId, text: " ×" + bindOnPickup.get(itemId) + " bind on pickup: gather or craft it on the crafting character" });
  }
  return { recipes: recipeRows, bindOnPickup: bindRows, craftedIsBindOnPickup: isBindOnPickup(plan.entry.itemId) };
}

export function shoppingText(line: ShoppingLine): string {
  return " ×" + line.quantity;
}

export function takingPlaces(line: TakingLine): string {
  const places: string[] = [];
  for (const place of Object.keys(line.places)) {
    places.push(line.places[place] + " in " + PLACE_LABELS[place]);
  }
  return line.character + ": " + places.join(", ");
}

interface Crafter {
  name: string;
  level: number | undefined;
}

function crafterListed(crafters: Crafter[], name: string): boolean {
  for (const crafter of crafters) {
    if (crafter.name === name) {
      return true;
    }
  }
  return false;
}

function knownCrafters(profession: string): Crafter[] {
  const crafters: Crafter[] = [];
  const known = inventory();
  if (known !== null) {
    for (const name of Object.keys(known.characters)) {
      const character = known.characters[name];
      if (!isInScope(character.ruleset, character.faction)) {
        continue;
      }
      for (const entry of character.professions) {
        if (entry.name === profession) {
          crafters.push({ name: name, level: entry.level });
        }
      }
    }
  }
  for (const character of state.settings.characters) {
    const snapshot = state.snapshots[character.slug];
    if (!snapshot || !isInScope(snapshot.ruleset, snapshot.faction as string)) {
      continue;
    }
    for (const entry of snapshot.professions) {
      if (entry.name === profession && !crafterListed(crafters, character.displayName)) {
        crafters.push({ name: character.displayName, level: (entry as { skillPoints?: number }).skillPoints });
      }
    }
  }
  return crafters;
}

export interface CrafterRow {
  profession: string;
  names: string;
  classes: string;
}

export function crafterRow(profession: string): CrafterRow {
  const names: string[] = [];
  for (const crafter of knownCrafters(profession)) {
    if (crafter.level) {
      names.push(crafter.name + " (" + crafter.level + ")");
    } else {
      names.push(crafter.name);
    }
  }
  if (names.length === 0) {
    return { profession: profession, names: "none of your characters", classes: "summary-value verdict-bad" };
  }
  return { profession: profession, names: names.join(", "), classes: "summary-value" };
}

export interface InventoryRow {
  key: string;
  account: string | null;
  name: string;
  label: string;
  money: number;
  included: boolean;
}

function compareByAccount(first: string, second: string): number {
  const characters = (inventory() as NonNullable<ReturnType<typeof inventory>>).characters;
  const firstAccount = characters[first].account || "";
  const secondAccount = characters[second].account || "";
  if (firstAccount !== secondAccount) {
    return firstAccount.localeCompare(secondAccount);
  }
  return first.localeCompare(second);
}

export function inventoryRows(): InventoryRow[] | null {
  const known = inventory();
  if (known === null) {
    return null;
  }
  const rows: InventoryRow[] = [];
  let currentAccount: string | undefined = undefined;
  for (const name of Object.keys(known.characters).sort(compareByAccount)) {
    const character = known.characters[name];
    if (!isInScope(character.ruleset, character.faction)) {
      continue;
    }
    let account: string | null = null;
    if (known.accountCount > 1 && character.account !== currentAccount) {
      currentAccount = character.account;
      account = currentAccount || "";
    }
    rows.push({ key: name, account: account, name: name, label: " " + name + " ", money: character.money, included: crafting.list.excludedCharacters.indexOf(name) === -1 });
  }
  return rows;
}

export function dataStatusText(): string {
  if (!state.wowFolderConnected) {
    return "Connect your WoW folder for prices, vendor info and your characters' materials.";
  }
  return [tsmStatusText(), inventoryStatusText(), questieStatusText()].join(" ");
}

export interface ScopeOption {
  key: string;
  label: string;
}

export function scopeOptions(): ScopeOption[] {
  return availableScopes().map(function optionFor(scope) {
    return { key: scopeKey(scope.ruleset, scope.faction), label: scope.ruleset + " · " + scope.faction };
  });
}

export function currentScopeKey(): string {
  const current = currentPriceScope();
  return scopeKey(current.ruleset, current.faction);
}

export function searchNames(): string[] {
  const seen = new Set<string>();
  for (const recipe of window.FOREVER_RECIPES) {
    seen.add(craftingItem(recipe.itemId).name);
  }
  return Array.from(seen);
}

function craftableItemByName(name: string): number | null {
  const wanted = name.trim().toLowerCase();
  for (const recipe of window.FOREVER_RECIPES) {
    if (craftingItem(recipe.itemId).name.toLowerCase() === wanted) {
      return recipe.itemId;
    }
  }
  return null;
}

function addEntry(itemId: number, quantity: number): void {
  for (const entry of crafting.list.entries) {
    if (entry.itemId === itemId) {
      entry.quantity += quantity;
      return;
    }
  }
  crafting.list.entries.push({ itemId: itemId, quantity: quantity });
}

export function addByName(name: string, quantityText: string): boolean {
  const itemId = craftableItemByName(name);
  if (itemId === null) {
    setStatus("No recipe makes \"" + name + "\". Pick a name from the suggestions.", "error");
    return false;
  }
  addEntry(itemId, Math.max(1, Number(quantityText) || 1));
  setStatus("Added " + craftingItem(itemId).name + ".", "success");
  saveCraftingList();
  return true;
}

export function chooseMode(itemId: number, mode: string): void {
  crafting.list.overrides[itemId] = mode;
  saveCraftingList();
}

export function removeEntry(index: number): void {
  crafting.list.entries.splice(index, 1);
  saveCraftingList();
}

export function changeQuantity(index: number, value: string): void {
  crafting.list.entries[index].quantity = Math.max(1, Number(value) || 1);
  saveCraftingList();
}

export function chooseBartering(value: string): void {
  crafting.list.barteringRank = Number(value) || 0;
  saveCraftingList();
}

export function useInventory(isUsed: boolean): void {
  crafting.list.useInventory = isUsed;
  saveCraftingList();
}

export function includeCharacter(name: string, isIncluded: boolean): void {
  const remaining = crafting.list.excludedCharacters.filter(function isOther(excluded) {
    return excluded !== name;
  });
  if (!isIncluded) {
    remaining.push(name);
  }
  crafting.list.excludedCharacters = remaining;
  saveCraftingList();
}

export async function refreshCraftingData(): Promise<void> {
  isReading.value = true;
  try {
    setStatus("Reading your WoW folder…", "info");
    await readWowFolder(true);
    setStatus("Prices and bags updated.", "success");
  } catch (error) {
    setStatus((error as Error).message, "error");
  } finally {
    isReading.value = false;
  }
}

export async function connectCraftingFolder(): Promise<void> {
  if (!window.showDirectoryPicker) {
    setStatus("This browser can't read local folders. Use Chrome.", "error");
    return;
  }
  try {
    const folder = await window.showDirectoryPicker({ id: "wow-folder", mode: "read" });
    if ((await WOW_FOLDER.addonsDirectory(folder)) === null) {
      setStatus("That folder has no Interface/AddOns inside. Pick your World of Warcraft or _forever_ folder.", "error");
      return;
    }
    await WOW_FOLDER.storeHandle(WOW_FOLDER.folderKey, folder);
    await refreshCraftingData();
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      setStatus((error as Error).message, "error");
    }
  }
}

export function chooseScope(key: string): void {
  crafting.list.scope = key;
  saveCraftingList();
  refreshCraftingData();
}

function entriesFromPlan(): CraftingEntry[] {
  const character = selectedCharacter();
  if (character === null) {
    return [];
  }
  const picks = Object.values((character.plan || {}) as Record<string, PlanPick>);
  return picks.filter(function hasRecipe(pick) {
    return crafting.recipesByItem.has(pick.itemId);
  }).map(function entryOf(pick) {
    return { itemId: pick.itemId, quantity: 1 };
  });
}

export function addFromLocationHash(): void {
  const match = /^#items=([\d:,]+)$/.exec(window.location.hash);
  if (match === null) {
    crafting.list.entries = entriesFromPlan();
    return;
  }
  const entries: CraftingEntry[] = [];
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

