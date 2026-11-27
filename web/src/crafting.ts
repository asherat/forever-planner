import { createApp } from "vue";
import CraftingPage from "./components/CraftingPage.vue";
import CraftingTopControls from "./components/CraftingTopControls.vue";
import { currentPriceScope, indexRecipes, loadCraftingList } from "./crafting-plan.ts";
import { exposeToLegacy } from "./legacy.ts";
import { QUESTIE } from "./questie.ts";
import { TSM } from "./tsm.ts";
import { addFromLocationHash, handleHashChange } from "./ui/crafting-page.ts";
import { refreshVue } from "./ui/render-tick.ts";

function questieItemIds(): number[] {
  return Object.keys(window.FOREVER_CRAFTING_ITEMS).map(Number);
}

function questieQuestIds(): number[] {
  return [];
}

function handleStartupError(error: Error): void {
  setStatus("Could not read your WoW folder: " + error.message, "error");
}

window.TSM = TSM;
window.QUESTIE = QUESTIE;
exposeToLegacy({ currentPriceScope: currentPriceScope, questieItemIds: questieItemIds, questieQuestIds: questieQuestIds, refreshVue: refreshVue });
enableMapPopovers();
loadState();
loadCraftingList();
indexRecipes();
addFromLocationHash();
window.addEventListener("hashchange", handleHashChange);
createApp(CraftingPage).mount("#crafting-page");
createApp(CraftingTopControls).mount("#crafting-top-controls");
readWowFolder(false).then(refreshVue).catch(handleStartupError);
