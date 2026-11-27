import type { TSM } from "./tsm.ts";
import type { Character, GameRules, GuideDungeon, GuideZone, Item, QuestieData, ReputationRequirement, Snapshot } from "./types.ts";
import type { TsmPrices } from "./tsm.ts";

declare global {
  interface Window {
    TSM: typeof TSM;
    GAME_RULES: GameRules;
    FOREVER_ITEMS: Item[];
    FOREVER_CRAFTING_ITEMS: Record<string, { vendorPrice?: number }>;
    start: () => void;
    startCrafting: () => void;
  }

  const state: {
    snapshots: Record<string, Snapshot>;
    settings: { characters: Character[]; selectedCharacterSlug: string | null; lookaheadLevels: number; [field: string]: unknown };
    tsm: TsmPrices | null;
    questie: QuestieData | null;
    tooltipRequirements: Record<string, { reputations?: ReputationRequirement[] }>;
    [field: string]: unknown;
  };
  function selectedCharacter(): Character | null;
  function priceFor(itemId: number): { buyNow: number; listed: number; usual: number } | null;
  function unitCost(itemId: number): number | null;
  function vendorDiscountRate(): number;
  function isVendorSoldFor(itemId: number, factionLetter: string): boolean;
  function preferredOffer(vendorOffer: { price: number } | null, auctionOffer: { price: number } | null): { price: number } | null;
  function guideZone(zoneName: string | undefined): GuideZone | null;
  function dungeonForArea(areaName: string | undefined): GuideDungeon | null;
}

export function exposeToLegacy(module: Record<string, unknown>): void {
  Object.assign(window, module);
}
