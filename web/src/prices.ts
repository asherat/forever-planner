import { STORAGE_KEYS, readStorage, state } from "./state.ts";
import type { Item } from "./types.ts";

const BARTERING_DISCOUNT_PER_RANK = 0.05;
const VENDOR_PREFERENCE_MARGIN = 0.15;
const WOWHEAD_ICON_URL = "https://wow.zamimg.com/images/wow/icons/medium/";

export const WOWHEAD_URL = "https://www.wowhead.com/forever/";

export interface PriceInfo {
  buyNow: number;
  listed: number;
  usual: number;
}

interface IconSource {
  iconUrl?: string | null;
  iconName?: string;
  icon?: number | null;
}

export function qualityClass(quality: string | undefined): string {
  return "quality-" + String(quality || "COMMON").toLowerCase();
}

export function iconUrlForItem(item: IconSource): string {
  if (item.iconUrl) {
    return item.iconUrl;
  }
  if (item.iconName) {
    return WOWHEAD_ICON_URL + item.iconName + ".jpg";
  }
  let iconId = window.GAME_RULES.unknownIconId;
  if (item.icon) {
    iconId = item.icon;
  }
  return "https://render.worldofwarcraft.com/forever-" + state.settings.region + "/icons/56/" + iconId + ".jpg";
}

export function wowheadUrl(item: Pick<Item, "id" | "suffix">): string {
  if (item.suffix) {
    return WOWHEAD_URL + "item=" + item.id + "?bonus=" + item.suffix.bonusId;
  }
  return WOWHEAD_URL + "item=" + item.id;
}

export function priceFor(itemId: number): PriceInfo | null {
  if (state.tsm === null) {
    return null;
  }
  const price = state.tsm.prices[itemId];
  if (!price) {
    return null;
  }
  const usual = price.marketValue || price.marketValueRecent || price.regionMarketValue || price.regionSale || 0;
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

export function unitCost(itemId: number): number | null {
  const price = priceFor(itemId);
  if (price === null) {
    return null;
  }
  if (price.buyNow) {
    return price.buyNow;
  }
  return price.usual;
}

export function isVendorSoldFor(itemId: number, factionLetter: string): boolean {
  if (state.questie === null || !state.questie.items[itemId]) {
    return false;
  }
  for (const source of state.questie.items[itemId].sources) {
    const friendlyTo = source.friendlyTo as string | undefined;
    if (source.type === "vendor" && (!friendlyTo || friendlyTo.indexOf(factionLetter) !== -1)) {
      return true;
    }
  }
  return false;
}

export function savedBarteringRank(): number {
  return Number(readStorage<{ barteringRank?: number }>(STORAGE_KEYS.crafting, {}).barteringRank) || 0;
}

export function vendorDiscountRate(barteringRank: number): number {
  return (Number(barteringRank) || 0) * BARTERING_DISCOUNT_PER_RANK;
}

export function preferredOffer<Offer extends { price: number }>(vendorOffer: Offer | null, auctionOffer: Offer | null): Offer | null {
  if (vendorOffer === null) {
    return auctionOffer;
  }
  if (auctionOffer === null || auctionOffer.price >= vendorOffer.price * (1 - VENDOR_PREFERENCE_MARGIN)) {
    return vendorOffer;
  }
  return auctionOffer;
}

export function formatMoney(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const copperLeft = copper % 100;
  const parts: string[] = [];
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
