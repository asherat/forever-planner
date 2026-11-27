import type { Inventory } from "./crafting-plan.ts";
import type { QuestieDetails } from "./questie.ts";
import type { TsmPrices } from "./tsm.ts";
import type { Character, PairedUpgradeOptions, ReputationRequirement, Settings, Snapshot, UpgradeOptions } from "./types.ts";
import type { CartEntry } from "./ui/crafting-cart.ts";
import type { QuestListEntry } from "./ui/quest-list.ts";

export const STORAGE_KEYS = {
  credentials: "foreverPlanner.credentials",
  settings: "foreverPlanner.settings",
  snapshots: "foreverPlanner.snapshots",
  tooltipRequirements: "foreverPlanner.tooltipRequirements",
  crafting: "foreverPlanner.crafting",
  craftingCart: "foreverPlanner.craftingCart"
};

export const DEFAULT_LOOKAHEAD_LEVELS = 3;
export const MAX_LOOKAHEAD_LEVELS = 10;
export const REGIONS = ["eu", "us", "kr", "tw"];

export interface Credentials {
  clientId: string;
  clientSecret: string;
}

export interface TooltipRequirement {
  reputations: ReputationRequirement[];
  failed?: boolean;
  checkedAt: number;
}

export interface PlannerState {
  credentials: Credentials;
  settings: Settings;
  snapshots: Record<string, Snapshot>;
  accessToken: string | null;
  accessTokenExpiresAt: number;
  tsm: TsmPrices | null;
  questie: QuestieDetails | null;
  inventory: Inventory | null;
  wowFolderConnected: boolean;
  folderErrors: Record<string, string>;
  tooltipRequirements: Record<string, TooltipRequirement>;
  craftingCart: CartEntry[];
  upgradeOptions: (UpgradeOptions | PairedUpgradeOptions)[];
  upgradesBySlot: Record<string, UpgradeOptions>;
  craftedUpgradePicks: number[];
  questUpgradePicks: QuestListEntry[];
}

export function defaultSettings(): Settings {
  return {
    region: "eu",
    characters: [],
    selectedCharacterSlug: null,
    lookaheadLevels: DEFAULT_LOOKAHEAD_LEVELS,
    hiddenItemIds: []
  };
}

export const state: PlannerState = {
  credentials: { clientId: "", clientSecret: "" },
  settings: defaultSettings(),
  snapshots: {},
  accessToken: null,
  accessTokenExpiresAt: 0,
  tsm: null,
  questie: null,
  inventory: null,
  wowFolderConnected: false,
  folderErrors: {},
  tooltipRequirements: {},
  craftingCart: [],
  upgradeOptions: [],
  upgradesBySlot: {},
  craftedUpgradePicks: [],
  questUpgradePicks: []
};

export function setStatus(message: string, kind: string): void {
  const statusLine = document.getElementById("status-line") as HTMLElement;
  statusLine.textContent = message;
  statusLine.dataset.kind = kind || "info";
}

export function readStorage<Value>(key: string, fallback: Value): Value {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    setStatus("Could not save to browser storage: " + (error as Error).message, "error");
  }
}

export function saveSettings(): void {
  writeStorage(STORAGE_KEYS.settings, state.settings);
}

export function saveSnapshots(): void {
  writeStorage(STORAGE_KEYS.snapshots, state.snapshots);
}

function moveSharedHiddenItemsToCharacters(): void {
  const sharedHiddenIds = (state.settings.hiddenItemIds || []) as number[];
  if (sharedHiddenIds.length === 0) {
    return;
  }
  for (const character of state.settings.characters) {
    character.hiddenItemIds = (character.hiddenItemIds || []).concat(sharedHiddenIds);
  }
  state.settings.hiddenItemIds = [];
  saveSettings();
}

export function loadState(): void {
  state.credentials = readStorage(STORAGE_KEYS.credentials, { clientId: "", clientSecret: "" });
  state.settings = Object.assign(defaultSettings(), readStorage(STORAGE_KEYS.settings, {}));
  state.snapshots = readStorage(STORAGE_KEYS.snapshots, {});
  state.tooltipRequirements = readStorage(STORAGE_KEYS.tooltipRequirements, {});
  state.craftingCart = readStorage(STORAGE_KEYS.craftingCart, []);
  moveSharedHiddenItemsToCharacters();
}

export function characterSlug(name: string, surname: string): string {
  return (name + "-" + surname).toLowerCase();
}

export function findCharacter(slug: string | null): Character | null {
  for (const character of state.settings.characters) {
    if (character.slug === slug) {
      return character;
    }
  }
  return null;
}

export function selectedCharacter(): Character | null {
  return findCharacter(state.settings.selectedCharacterSlug);
}
