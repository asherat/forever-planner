import { exposeToLegacy } from "./legacy.ts";
import * as scoring from "./scoring.ts";
import * as sources from "./sources.ts";
import * as upgrades from "./upgrades.ts";
import { TSM } from "./tsm.ts";

window.TSM = TSM;
exposeToLegacy(scoring);
exposeToLegacy(sources);
exposeToLegacy(upgrades);
window.start();
