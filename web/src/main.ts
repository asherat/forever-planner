import { exposeToLegacy } from "./legacy.ts";
import * as scoring from "./scoring.ts";
import * as sources from "./sources.ts";
import { TSM } from "./tsm.ts";

window.TSM = TSM;
exposeToLegacy(scoring);
exposeToLegacy(sources);
window.start();
