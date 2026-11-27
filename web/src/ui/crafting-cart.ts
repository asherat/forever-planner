import "../legacy.ts";
import { equippedItemIds, itemName } from "../sources.ts";
import type { Snapshot } from "../types.ts";
import { refreshVue } from "./render-tick.ts";

export interface CartEntry {
  itemId: number;
  quantity: number;
}

export function cartEntries(): CartEntry[] {
  return state.craftingCart as CartEntry[];
}

function saveCart(): void {
  writeStorage(STORAGE_KEYS.craftingCart, state.craftingCart);
  refreshVue();
}

export function isInCart(itemId: number): boolean {
  for (const entry of cartEntries()) {
    if (entry.itemId === itemId) {
      return true;
    }
  }
  return false;
}

export function addToCart(itemId: number): void {
  for (const entry of cartEntries()) {
    if (entry.itemId === itemId) {
      entry.quantity += 1;
      saveCart();
      return;
    }
  }
  cartEntries().push({ itemId: itemId, quantity: 1 });
  saveCart();
}

export function missingCraftedUpgrades(): number[] {
  const missing: number[] = [];
  for (const itemId of (state.craftedUpgradePicks || []) as number[]) {
    if (!isInCart(itemId)) {
      missing.push(itemId);
    }
  }
  return missing;
}

export function addCraftedUpgrades(): void {
  for (const itemId of missingCraftedUpgrades()) {
    cartEntries().push({ itemId: itemId, quantity: 1 });
  }
  saveCart();
}

export function removeFromCart(index: number): void {
  cartEntries().splice(index, 1);
  saveCart();
}

export function clearCart(): void {
  state.craftingCart = [];
  saveCart();
}

export function changeQuantity(index: number, value: string): void {
  cartEntries()[index].quantity = Math.max(1, Number(value) || 1);
  saveCart();
}

export function craftAllHref(): string {
  const parts: string[] = [];
  for (const entry of cartEntries()) {
    parts.push(entry.itemId + ":" + entry.quantity);
  }
  return "crafting.html#items=" + parts.join(",");
}

export function pruneCraftingCart(snapshot: Snapshot): string[] {
  const equipped = equippedItemIds(snapshot);
  const kept: CartEntry[] = [];
  const removedNames: string[] = [];
  for (const entry of cartEntries()) {
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
