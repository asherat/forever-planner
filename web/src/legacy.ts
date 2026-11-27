import type { QUESTIE } from "./questie.ts";
import type { TSM } from "./tsm.ts";
import type { Character, GameRules, GuideDungeon, Item, QuestieData, ReputationRequirement, Snapshot, ZoneGuide } from "./types.ts";
import type { TsmPrices } from "./tsm.ts";

declare global {
  interface Window {
    TSM: typeof TSM;
    QUESTIE: typeof QUESTIE;
    GAME_RULES: GameRules;
    FOREVER_ITEMS: Item[];
    FOREVER_CRAFTING_ITEMS: Record<string, { vendorPrice?: number }>;
    FOREVER_DUNGEONS: GuideDungeon[];
    ZONE_GUIDE: ZoneGuide;
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
  function saveSettings(): void;
  function setStatus(message: string, kind: string): void;
  const WOWHEAD_URL: string;
  function placeForSource(source: { zone: string; x: number | null; y: number | null; name?: string }): { zone: string; x: number | null; y: number | null; caption: string };
  function formatMoney(copper: number): string;
  function addToCart(itemId: number): void;
  function mapZone(zoneName: string): unknown;
  function dungeonEntrance(dungeonName: string): { zone: string; x: number; y: number } | null;
  function render(): void;
  function qualityClass(quality: string): string;
  function iconUrlForItem(item: Item): string;
  function wowheadUrl(item: Item): string;
  function preferredOffer(vendorOffer: { price: number } | null, auctionOffer: { price: number } | null): { price: number } | null;
}

export function exposeToLegacy(module: Record<string, unknown>): void {
  Object.assign(window, module);
}
