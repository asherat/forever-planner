import { markRaw, reactive, shallowRef } from "vue";
import type { Inventory } from "./crafting-plan.ts";
import type { QuestieDetails } from "./questie.ts";
import type { TsmPrices } from "./tsm.ts";
import type { Character, PairedUpgradeOptions, ReputationRequirement, Settings, Snapshot, UpgradeOptions } from "./types.ts";

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
  upgradeOptions: (UpgradeOptions | PairedUpgradeOptions)[];
  upgradesBySlot: Record<string, UpgradeOptions>;
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

export const state: PlannerState = reactive({
  credentials: { clientId: "", clientSecret: "" },
  settings: defaultSettings(),
  snapshots: {},
  accessToken: null,
  accessTokenExpiresAt: 0,
  tsm: shallowRef(null),
  questie: shallowRef(null),
  inventory: shallowRef(null),
  wowFolderConnected: false,
  folderErrors: {},
  tooltipRequirements: {},
  upgradeOptions: shallowRef([]),
  upgradesBySlot: shallowRef({})
}) as unknown as PlannerState;

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
  } catch {
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

function rawSnapshots(snapshots: Record<string, Snapshot>): Record<string, Snapshot> {
  for (const slug of Object.keys(snapshots)) {
    snapshots[slug] = markRaw(snapshots[slug]);
  }
  return snapshots;
}

export function loadState(): void {
  state.credentials = readStorage(STORAGE_KEYS.credentials, { clientId: "", clientSecret: "" });
  state.settings = Object.assign(defaultSettings(), readStorage(STORAGE_KEYS.settings, {}));
  state.snapshots = rawSnapshots(readStorage(STORAGE_KEYS.snapshots, {}));
  state.tooltipRequirements = readStorage(STORAGE_KEYS.tooltipRequirements, {});
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

export type SnapshotProfession = Snapshot["professions"][number];

export function snapshotOf(character: Character | null): Snapshot | null {
  if (character === null) {
    return null;
  }
  return state.snapshots[character.slug] || null;
}

export function professionOf(snapshot: Snapshot | null, name: string | undefined): SnapshotProfession | null {
  if (snapshot === null) {
    return null;
  }
  for (const profession of snapshot.professions) {
    if (profession.name === name) {
      return profession;
    }
  }
  return null;
}

export function knowsRecipe(snapshot: Snapshot | null, professionName: string | undefined, recipeId: number | undefined): boolean {
  const profession = professionOf(snapshot, professionName);
  return profession !== null && recipeId !== undefined && (profession.recipeIds || []).indexOf(recipeId) !== -1;
}
