import { exposeToLegacy } from "./legacy.ts";
import * as scoring from "./scoring.ts";
import { TSM } from "./tsm.ts";

window.TSM = TSM;
exposeToLegacy(scoring);
window.start();
