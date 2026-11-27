import fs from "node:fs";
import vm from "node:vm";

const PUBLIC_DIRECTORY = new URL("../../web/public/", import.meta.url);
const CLASSIC_SCRIPTS = ["game-rules.js", "data/dungeons.js", "zone-guide.js", "common.js", "app.js"];

function createStorage() {
  const values = new Map();
  return {
    getItem: function getItem(key) {
      if (values.has(key)) {
        return values.get(key);
      }
      return null;
    },
    setItem: function setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem: function removeItem(key) {
      values.delete(key);
    },
    clear: function clear() {
      values.clear();
    }
  };
}

globalThis.window = globalThis;
globalThis.localStorage = createStorage();
for (const fileName of CLASSIC_SCRIPTS) {
  vm.runInThisContext(fs.readFileSync(new URL(fileName, PUBLIC_DIRECTORY), "utf8"), { filename: fileName });
}
Object.assign(globalThis, await import("../../web/src/route.ts"));
Object.assign(globalThis, await import("../../web/src/sources.ts"));
Object.assign(globalThis, await import("../../web/src/scoring.ts"));
Object.assign(globalThis, await import("../../web/src/upgrades.ts"));

export const planner = globalThis;

export function run(expression) {
  return vm.runInThisContext(expression);
}

export function resetPlanner(items, characterOverrides) {
  globalThis.FOREVER_ITEMS = items || [];
  resetSourceCaches();
  run("state.settings = defaultSettings(); state.snapshots = {}; state.tsm = null; state.questie = null; state.undo = null; state.tooltipRequirements = {};");
  const state = run("state");
  const character = Object.assign({ slug: "test-hero", displayName: "Test Hero", hiddenItemIds: [] }, characterOverrides);
  state.settings.characters.push(character);
  state.settings.selectedCharacterSlug = character.slug;
  const snapshot = {
    level: 43, className: "Druid", factionType: "HORDE", ruleset: "Normal",
    talentSpecs: ["druid-feral-cat"], equipment: {}, completedQuestIds: [], professions: [], reputations: {}
  };
  state.snapshots[character.slug] = snapshot;
  return { character: character, snapshot: snapshot, state: state };
}
