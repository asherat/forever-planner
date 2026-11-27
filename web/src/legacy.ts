import type { TSM } from "./tsm.ts";
import type { Character, GameRules, Item, Snapshot } from "./types.ts";

declare global {
  interface Window {
    TSM: typeof TSM;
    GAME_RULES: GameRules;
    FOREVER_ITEMS: Item[];
    start: () => void;
    startCrafting: () => void;
  }

  const state: {
    snapshots: Record<string, Snapshot>;
    settings: { characters: Character[]; selectedCharacterSlug: string | null; lookaheadLevels: number; [field: string]: unknown };
    [field: string]: unknown;
  };
  function itemById(itemId: number): Item | null;
  function itemFaction(item: Item): string | null;
}

export function exposeToLegacy(module: Record<string, unknown>): void {
  Object.assign(window, module);
}
