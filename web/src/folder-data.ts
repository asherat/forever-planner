import "./legacy.ts";
import type { Inventory, InventoryCharacter } from "./crafting-plan.ts";
import type { QuestieDetails } from "./questie.ts";
import { state } from "./state.ts";
import type { AccountFile } from "./wow-folder.ts";
import { WOW_FOLDER } from "./wow-folder.ts";

type FolderReader = (folder: FileSystemDirectoryHandle) => Promise<void>;

export interface FolderScope {
  currentPriceScope(): { ruleset: string; faction: string };
  questieItemIds(): number[];
  questieQuestIds(): number[];
}

let pageScope: FolderScope = {
  currentPriceScope: function noScope() {
    return { ruleset: "", faction: "" };
  },
  questieItemIds: function noItems() {
    return [];
  },
  questieQuestIds: function noQuests() {
    return [];
  }
};

export function useFolderScope(scope: FolderScope): void {
  pageScope = scope;
}

async function readQuestieFile(folder: FileSystemDirectoryHandle): Promise<void> {
  const questieFile = await WOW_FOLDER.readAddonFile(folder, window.QUESTIE.addonName, window.QUESTIE.fileName);
  if (questieFile === null) {
    state.questie = null;
    return;
  }
  if (state.questie !== null && state.questie.modifiedAt === questieFile.modifiedAt) {
    return;
  }
  const details = window.QUESTIE.buildDetails(questieFile.text, pageScope.questieItemIds(), window.FOREVER_ZONES, pageScope.questieQuestIds()) as QuestieDetails;
  details.modifiedAt = questieFile.modifiedAt;
  details.dungeonEntrances = {};
  const dungeonFile = await WOW_FOLDER.readAddonFile(folder, window.QUESTIE.addonName, window.QUESTIE.dungeonFile);
  if (dungeonFile !== null) {
    details.dungeonEntrances = window.QUESTIE.parseDungeonEntrances(dungeonFile.text, window.FOREVER_ZONES);
  }
  state.questie = details;
}

async function readTsmFromFolder(folder: FileSystemDirectoryHandle): Promise<void> {
  const tsmFile = await WOW_FOLDER.readAddonFile(folder, window.TSM.addonName, window.TSM.fileName);
  if (tsmFile === null) {
    state.tsm = null;
    return;
  }
  const scope = pageScope.currentPriceScope();
  state.tsm = window.TSM.readPrices(tsmFile.text, scope.ruleset, scope.faction);
}

async function readLegacyTsmFile(askPermission: boolean): Promise<void> {
  const handle = await WOW_FOLDER.loadHandle(WOW_FOLDER.legacyTsmFileKey);
  if (handle === null || !(await WOW_FOLDER.ensureReadPermission(handle, askPermission))) {
    state.tsm = null;
    return;
  }
  const file = await (handle as FileSystemFileHandle).getFile();
  const scope = pageScope.currentPriceScope();
  state.tsm = window.TSM.readPrices(await file.text(), scope.ruleset, scope.faction);
}

function compareAccountFiles(first: AccountFile, second: AccountFile): number {
  return first.account.localeCompare(second.account);
}

async function readInventoryFromFolder(folder: FileSystemDirectoryHandle): Promise<void> {
  const files = await WOW_FOLDER.readSavedVariablesFiles(folder, window.TSM.savedVariablesFile);
  if (files.length === 0) {
    state.inventory = null;
    return;
  }
  const characters: Record<string, InventoryCharacter> = {};
  let newest = 0;
  files.sort(compareAccountFiles);
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const accountCharacters: Record<string, InventoryCharacter> = window.TSM.parseInventory(file.text);
    for (const name of Object.keys(accountCharacters)) {
      accountCharacters[name].account = "Account " + (index + 1);
    }
    Object.assign(characters, accountCharacters);
    if (file.modifiedAt > newest) {
      newest = file.modifiedAt;
    }
  }
  const inventory: Inventory = { characters: characters, modifiedAt: newest, accountCount: files.length };
  state.inventory = inventory;
}

async function readFolderSource(sourceKey: string, reader: FolderReader, folder: FileSystemDirectoryHandle): Promise<void> {
  try {
    await reader(folder);
  } catch (error) {
    state.folderErrors[sourceKey] = (error as Error).message;
    if (sourceKey === "questie") {
      state.questie = null;
    } else if (sourceKey === "tsm") {
      state.tsm = null;
    } else {
      state.inventory = null;
    }
  }
}

export async function readWowFolder(askPermission: boolean): Promise<void> {
  const folder = await WOW_FOLDER.loadHandle(WOW_FOLDER.folderKey);
  if (folder === null) {
    state.wowFolderConnected = false;
    state.questie = null;
    await readLegacyTsmFile(askPermission);
    return;
  }
  if (!(await WOW_FOLDER.ensureReadPermission(folder, askPermission))) {
    state.wowFolderConnected = false;
    return;
  }
  const directory = folder as FileSystemDirectoryHandle;
  state.wowFolderConnected = true;
  state.folderErrors = {};
  await readFolderSource("questie", readQuestieFile, directory);
  await readFolderSource("tsm", readTsmFromFolder, directory);
  await readFolderSource("inventory", readInventoryFromFolder, directory);
}

function folderErrorText(sourceKey: string): string {
  if (state.folderErrors && state.folderErrors[sourceKey]) {
    return " (could not read it: " + state.folderErrors[sourceKey] + ")";
  }
  return "";
}

export function questieStatusText(): string {
  if (state.questie === null) {
    return "Questie: not found. Install Questie for item sources." + folderErrorText("questie");
  }
  return "Questie " + state.questie.version + ": sources for " + Object.keys(state.questie.items).length + " items.";
}

export function inventoryStatusText(): string {
  if (state.inventory === null) {
    return "Inventory: not found. TSM saves it when a character logs out." + folderErrorText("inventory");
  }
  return "Inventory: " + Object.keys(state.inventory.characters).length + " characters, saved " + new Date(state.inventory.modifiedAt).toLocaleString() + ".";
}

export function tsmStatusText(): string {
  if (state.tsm === null) {
    return "TSM prices: not found. Install the TSM desktop app for auction prices." + folderErrorText("tsm");
  }
  let scopeText = "region prices only";
  if (state.tsm.scope !== null) {
    scopeText = state.tsm.scope + " auction house and region prices";
  }
  return "TSM prices: " + scopeText + ", from " + new Date(state.tsm.downloadedAt).toLocaleString() + ".";
}
