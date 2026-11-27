import { exposeToLegacy } from "./legacy.ts";
import * as scoring from "./scoring.ts";
import * as sources from "./sources.ts";
import * as upgrades from "./upgrades.ts";
import * as route from "./route.ts";
import { TSM } from "./tsm.ts";

window.TSM = TSM;
exposeToLegacy(scoring);
exposeToLegacy(sources);
exposeToLegacy(upgrades);
exposeToLegacy(route);
window.start();
