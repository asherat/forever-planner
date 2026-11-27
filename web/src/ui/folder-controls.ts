import { ref } from "vue";
import "../legacy.ts";
import { availableScopes, crafting, currentPriceScope, saveCraftingList, scopeKey } from "../crafting-plan.ts";
import { inventoryStatusText, questieStatusText, readWowFolder, tsmStatusText } from "../folder-data.ts";
import { setStatus, state } from "../state.ts";
import { WOW_FOLDER } from "../wow-folder.ts";

export const isReading = ref(false);

export function dataStatusText(): string {
  if (!state.wowFolderConnected) {
    return "Connect your WoW folder for prices, vendor info and your characters' materials.";
  }
  return [tsmStatusText(), inventoryStatusText(), questieStatusText()].join(" ");
}

export interface ScopeOption {
  key: string;
  label: string;
}

export function scopeOptions(): ScopeOption[] {
  return availableScopes().map(function optionFor(scope) {
    return { key: scopeKey(scope.ruleset, scope.faction), label: scope.ruleset + " · " + scope.faction };
  });
}

export function currentScopeKey(): string {
  const current = currentPriceScope();
  return scopeKey(current.ruleset, current.faction);
}

export async function refreshFolderData(): Promise<void> {
  isReading.value = true;
  try {
    setStatus("Reading your WoW folder…", "info");
    await readWowFolder(true);
    setStatus("Prices and bags updated.", "success");
  } catch (error) {
    setStatus((error as Error).message, "error");
  } finally {
    isReading.value = false;
  }
}

export async function connectFolder(): Promise<void> {
  if (!window.showDirectoryPicker) {
    setStatus("This browser can't read local folders. Use Chrome.", "error");
    return;
  }
  try {
    const folder = await window.showDirectoryPicker({ id: "wow-folder", mode: "read" });
    if ((await WOW_FOLDER.addonsDirectory(folder)) === null) {
      setStatus("That folder has no Interface/AddOns inside. Pick your World of Warcraft or _forever_ folder.", "error");
      return;
    }
    await WOW_FOLDER.storeHandle(WOW_FOLDER.folderKey, folder);
    await refreshFolderData();
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      setStatus((error as Error).message, "error");
    }
  }
}

export function chooseScope(key: string): void {
  crafting.list.scope = key;
  saveCraftingList();
  refreshFolderData();
}
