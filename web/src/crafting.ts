import * as craftingPlan from "./crafting-plan.ts";
import { exposeToLegacy } from "./legacy.ts";
import { QUESTIE } from "./questie.ts";
import { TSM } from "./tsm.ts";

window.TSM = TSM;
window.QUESTIE = QUESTIE;
exposeToLegacy(craftingPlan);
window.startCrafting();
