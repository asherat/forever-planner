import type { QUESTIE } from "./questie.ts";
import type { TSM } from "./tsm.ts";
import type { GameRules, GuideDungeon, Item, ZoneGuide } from "./types.ts";
import type { Recipe } from "./crafting-plan.ts";
import type { MapZone } from "./map-popover.ts";
import type { Tools } from "./profession-guide.ts";

declare global {
  interface Window {
    TSM: typeof TSM;
    QUESTIE: typeof QUESTIE;
    GAME_RULES: GameRules;
    FOREVER_ITEMS: Item[];
    FOREVER_CRAFTING_ITEMS: Record<string, { name: string; quality: string; icon: number | null; vendorPrice?: number; bindOnPickup?: boolean }>;
    FOREVER_RECIPES: Recipe[];
    FOREVER_RECIPE_LEVELS: Record<string, [number, number, number, number]>;
    FOREVER_RECIPE_NAMES: Record<string, string>;
    FOREVER_TOOLS: Tools;
    FOREVER_DUNGEONS: GuideDungeon[];
    ZONE_GUIDE: ZoneGuide;
    FOREVER_MAPS: { zones: Record<string, MapZone>; continents: Record<string, { uiMapId: number }> };
    FOREVER_ZONES: Record<string, string>;
    showDirectoryPicker?: (options: { id: string; mode: string }) => Promise<FileSystemDirectoryHandle>;
    FOREVER_REPUTATIONS: Record<string, { id: number; side: string | null }>;
  }

}

export function exposeForDebugging(module: Record<string, unknown>): void {
  Object.assign(window, module);
}
