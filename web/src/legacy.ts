import type { QUESTIE } from "./questie.ts";
import type { TSM } from "./tsm.ts";
import type { Character, GameRules, GuideDungeon, Item, QuestieData, ReputationRequirement, Settings, Snapshot, ZoneGuide } from "./types.ts";
import type { TsmPrices } from "./tsm.ts";
import type { Recipe } from "./crafting-plan.ts";

declare global {
  interface Window {
    TSM: typeof TSM;
    QUESTIE: typeof QUESTIE;
    GAME_RULES: GameRules;
    FOREVER_ITEMS: Item[];
    FOREVER_CRAFTING_ITEMS: Record<string, { name: string; quality: string; icon: number | null; vendorPrice?: number; bindOnPickup?: boolean }>;
    FOREVER_RECIPES: Recipe[];
    FOREVER_DUNGEONS: GuideDungeon[];
    ZONE_GUIDE: ZoneGuide;
    WOW_FOLDER: {
      folderKey: string;
      legacyTsmFileKey: string;
      addonsDirectory(folder: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null>;
      storeHandle(key: string, handle: FileSystemHandle): Promise<void>;
      forgetHandle(key: string): Promise<void>;
    };
    showDirectoryPicker?: (options: { id: string; mode: string }) => Promise<FileSystemDirectoryHandle>;
    start: () => void;
  }

  const state: {
    snapshots: Record<string, Snapshot>;
    settings: Settings;
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
  function writeStorage(key: string, value: unknown): void;
  const STORAGE_KEYS: Record<string, string>;
  function mapZone(zoneName: string): unknown;
  function dungeonEntrance(dungeonName: string): { zone: string; x: number; y: number } | null;
  function render(): void;
  function enableMapPopovers(): void;
  function loadState(): void;
  function refreshCharacter(character: Character): Promise<void>;
  function handleTsmStartupError(error: Error): void;
  function defaultSettings(): Settings;
  const DEFAULT_LOOKAHEAD_LEVELS: number;
  const MAX_LOOKAHEAD_LEVELS: number;
  const REGIONS: string[];
  function saveSnapshots(): void;
  function characterSlug(name: string, surname: string): string;
  function findCharacter(slug: string): Character | null;
  function readWowFolder(askPermission: boolean): Promise<void>;
  function questieStatusText(): string;
  function tsmStatusText(): string;
  function inventoryStatusText(): string;
  function qualityClass(quality: string): string;
  function iconUrlForItem(item: Item): string;
  function wowheadUrl(item: Item): string;
  function preferredOffer<Offer extends { price: number }>(vendorOffer: Offer | null, auctionOffer: Offer | null): Offer | null;
  function readStorage<Value>(key: string, fallback: Value): Value;
}

export function exposeToLegacy(module: Record<string, unknown>): void {
  Object.assign(window, module);
}
