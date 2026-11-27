import CraftingPage from "./components/CraftingPage.vue";
import { startToolPage } from "./tool-page.ts";
import { addFromLocationHash } from "./ui/crafting-page.ts";

function startCraftingPage(): void {
  addFromLocationHash();
  window.addEventListener("hashchange", addFromLocationHash);
}

startToolPage(CraftingPage, "#crafting-page", startCraftingPage);
