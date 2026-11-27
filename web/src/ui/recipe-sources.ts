import "../legacy.ts";
import { craftingItem, ownFactionLetter } from "../crafting-plan.ts";
import type { Recipe } from "../crafting-plan.ts";
import { placeForSource } from "../map-popover.ts";
import { WOWHEAD_URL } from "../prices.ts";
import { state } from "../state.ts";
import type { ItemSource } from "../types.ts";
import { mapTargetAttributes } from "./map-target.ts";
import type { MapAttributes } from "./map-target.ts";

const RECIPE_SOURCES_SHOWN = 2;

function teachingSources(itemId: number): ItemSource[] {
  if (state.questie === null || !state.questie.items[itemId]) {
    return [];
  }
  const letter = ownFactionLetter();
  const sources: ItemSource[] = [];
  for (const source of state.questie.items[itemId].sources) {
    if (source.type === "vendor" && source.friendlyTo && (source.friendlyTo as string).indexOf(letter) === -1) {
      continue;
    }
    sources.push(source);
  }
  return sources;
}

export interface RecipeSourceLine {
  key: number;
  prefix: string;
  npcUrl: string;
  npcName: string;
  suffix: string;
  coordinates: string;
  mapAttributes: MapAttributes;
  classes: string;
}

function recipeSourceText(teachingName: string, source: ItemSource): string {
  if (source.type === "world-drop") {
    return teachingName + ": world drop";
  }
  return teachingName + ": " + source.type + " in " + (source.zone || "an unknown place");
}

function sourceLine(teachingName: string, source: ItemSource, index: number): RecipeSourceLine {
  const line: RecipeSourceLine = { key: index, prefix: "", npcUrl: "", npcName: "", suffix: "", coordinates: "", mapAttributes: {}, classes: "recipe-source-line" };
  if (source.type === "vendor" || source.type === "drop") {
    let verb = ": drops from ";
    if (source.type === "vendor") {
      verb = ": sold by ";
    }
    line.prefix = teachingName + verb;
    line.npcUrl = WOWHEAD_URL + "npc=" + source.npcId;
    line.npcName = source.npc as string;
    line.suffix = " in " + source.zone;
  } else {
    line.prefix = recipeSourceText(teachingName, source);
  }
  const place = placeForSource(source as unknown as { zone: string; x: number | null; y: number | null });
  if (place.x !== null && place.y !== null) {
    line.coordinates = " (" + place.x.toFixed(1) + ", " + place.y.toFixed(1) + ")";
  }
  line.mapAttributes = mapTargetAttributes(place.zone, place.x, place.y, place.caption);
  if (line.mapAttributes["data-map-zone"] !== undefined) {
    line.classes = "recipe-source-line has-map";
  }
  return line;
}

export interface RecipeSourceView {
  text: string;
  lines: RecipeSourceLine[];
}

export function recipeSource(recipe: Recipe): RecipeSourceView {
  if (!recipe.teachingItemId) {
    return { text: "Learned from a " + recipe.profession + " trainer.", lines: [] };
  }
  const teachingName = craftingItem(recipe.teachingItemId).name;
  const sources = teachingSources(recipe.teachingItemId);
  if (sources.length === 0) {
    return { text: teachingName + ": source unknown. Check the auction house.", lines: [] };
  }
  return {
    text: "",
    lines: sources.slice(0, RECIPE_SOURCES_SHOWN).map(function lineFor(source, index) {
      return sourceLine(teachingName, source, index);
    })
  };
}
