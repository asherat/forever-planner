import { createApp } from "vue";
import type { Component } from "vue";
import FolderTopControls from "./components/FolderTopControls.vue";
import { currentPriceScope, indexRecipes, loadCraftingList } from "./crafting-plan.ts";
import { exposeForDebugging } from "./legacy.ts";
import { QUESTIE } from "./questie.ts";
import { TSM } from "./tsm.ts";
import { readWowFolder, useFolderScope } from "./folder-data.ts";
import { enableMapPopovers } from "./map-popover.ts";
import * as plannerState from "./state.ts";
import { loadState, setStatus } from "./state.ts";
import { WOW_FOLDER } from "./wow-folder.ts";

function questieItemIds(): number[] {
  return Object.keys(window.FOREVER_CRAFTING_ITEMS).map(Number);
}

function questieQuestIds(): number[] {
  return [];
}

function handleStartupError(error: Error): void {
  setStatus("Could not read your WoW folder: " + error.message, "error");
}

export function startToolPage(page: Component, mountSelector: string, startPage: () => void): void {
  window.TSM = TSM;
  window.QUESTIE = QUESTIE;
  exposeForDebugging(plannerState);
  exposeForDebugging({ WOW_FOLDER: WOW_FOLDER, readWowFolder: readWowFolder });
  useFolderScope({ currentPriceScope: currentPriceScope, questieItemIds: questieItemIds, questieQuestIds: questieQuestIds });
  exposeForDebugging({ currentPriceScope: currentPriceScope, questieItemIds: questieItemIds, questieQuestIds: questieQuestIds });
  enableMapPopovers();
  loadState();
  loadCraftingList();
  indexRecipes();
  startPage();
  createApp(page).mount(mountSelector);
  createApp(FolderTopControls).mount("#crafting-top-controls");
  readWowFolder(false).catch(handleStartupError);
}
