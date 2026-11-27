import "../legacy.ts";
import { collectNodes, crafting, craftingItem, inventory, isBindOnPickup, isInScope, saveCraftingList } from "../crafting-plan.ts";
import type { CraftingEntry, Plan, PlanMode, PlanNode, Recipe, ShoppingLine } from "../crafting-plan.ts";
import { knowsRecipe, professionOf, selectedCharacter, setStatus, state } from "../state.ts";
import { characterPlan, slotPicks } from "./gear-plan.ts";
import { recipeSource } from "./recipe-sources.ts";
import type { RecipeSourceView } from "./recipe-sources.ts";
type ChoosableMode = Exclude<PlanMode, "buy">;

const CRAFTING_MODES: Record<ChoosableMode, string> = { own: "Have", vendor: "Vendor", ah: "AH", craft: "Craft" };
const MODE_ICON_PATHS: Record<ChoosableMode, string> = {
  own: "M5 7h14l-1.2 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 7zm4 0V6a3 3 0 0 1 6 0v1",
  vendor: "M3 9l2-5h14l2 5M3 9h18M3 9v1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9M5 13v7h14v-7M10 20v-4h4v4",
  ah: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zm-8 3v4c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 4v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4m-16 4v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4",
  craft: "M14.5 4.5l5 5-2 2-1.5-1.5-8.5 8.5a1.8 1.8 0 0 1-2.5-2.5L13.5 7.5 12 6l2.5-1.5z"
};

export interface ModeChoice {
  mode: ChoosableMode;
  label: string;
  iconPath: string;
  pressed: boolean;
  showsMoney: boolean;
  copper: number;
  text: string;
}

function pressedMode(node: PlanNode): ChoosableMode {
  if (node.mode === "own" || node.mode === "craft") {
    return node.mode;
  }
  if (node.buyOffer !== null && node.buyOffer.where === "vendor") {
    return "vendor";
  }
  return "ah";
}

function modeTotal(node: PlanNode, mode: ChoosableMode): number | null {
  if (mode === "vendor") {
    return node.vendorTotal;
  }
  if (mode === "ah") {
    return node.auctionTotal;
  }
  return node.craftTotal;
}

function modeChoice(node: PlanNode, mode: ChoosableMode): ModeChoice {
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
  const modes: ChoosableMode[] = [];
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
    if (knowsRecipe(snapshot, recipe.profession, recipe.id)) {
      names.push(character.displayName);
    }
  }
  return names;
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
      source = recipeSource(recipe, true);
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
    const entry = professionOf(snapshot, profession);
    if (entry !== null && !crafterListed(crafters, character.displayName)) {
      crafters.push({ name: character.displayName, level: entry.skillPoints });
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

export function searchNames(): string[] {
  const seen = new Set<string>();
  for (const itemId of crafting.recipesByItem.keys()) {
    seen.add(craftingItem(itemId).name);
  }
  return Array.from(seen);
}

function craftableItemByName(name: string): number | null {
  const wanted = name.trim().toLowerCase();
  for (const itemId of crafting.recipesByItem.keys()) {
    if (craftingItem(itemId).name.toLowerCase() === wanted) {
      return itemId;
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

export function chooseMode(itemId: number, mode: ChoosableMode): void {
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

export function swapEntries(first: number, second: number): void {
  const entries = crafting.list.entries;
  const moved = entries[first];
  entries[first] = entries[second];
  entries[second] = moved;
}

export function shareMaterials(isShared: boolean): void {
  crafting.list.sharesMaterials = isShared;
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

function entriesFromPlan(): CraftingEntry[] {
  const character = selectedCharacter();
  if (character === null) {
    return [];
  }
  const plan = characterPlan(character);
  const picks = Object.keys(plan).flatMap(function picksOf(slotKey) {
    return slotPicks(plan, slotKey);
  });
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
  setStatus("Loaded " + entries.length + " items from your gear plan.", "success");
}

