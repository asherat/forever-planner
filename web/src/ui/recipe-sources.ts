import { toRaw } from "vue";
import "../legacy.ts";
import { craftingItem, ownFactionLetter } from "../crafting-plan.ts";
import type { Recipe } from "../crafting-plan.ts";
import { placeForSource } from "../map-popover.ts";
import { WOWHEAD_URL } from "../prices.ts";
import { state } from "../state.ts";
import { trainersTitled } from "../questie.ts";
import type { Trainer } from "../questie.ts";
import type { ItemSource } from "../types.ts";
import { mapTargetAttributes } from "./map-target.ts";
import type { MapAttributes } from "./map-target.ts";

const RECIPE_SOURCES_SHOWN = 2;
const TRAINER_NOUNS: Record<string, string> = { Alchemy: "Alchemist", Blacksmithing: "Blacksmith", Enchanting: "Enchanter", Engineering: "Engineer", Leatherworking: "Leatherworker", Tailoring: "Tailor" };
const RANKS_WITH_OWN_TRAINERS = ["Expert", "Artisan"];

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

function trainerTitle(profession: string, rankName: string): string | null {
  const noun = TRAINER_NOUNS[profession];
  if (!noun || RANKS_WITH_OWN_TRAINERS.indexOf(rankName) === -1) {
    return null;
  }
  return rankName + " " + noun;
}

function ownFactionTrainers(title: string): Trainer[] {
  if (state.questie === null) {
    return [];
  }
  const letter = ownFactionLetter();
  return trainersTitled(toRaw(state.questie), title).filter(function isFriendly(trainer) {
    return trainer.friendlyTo === "" || trainer.friendlyTo.indexOf(letter) !== -1;
  });
}

function trainerLine(title: string, trainer: Trainer, index: number): RecipeSourceLine {
  const line: RecipeSourceLine = { key: index, prefix: title + ": ", npcUrl: WOWHEAD_URL + "npc=" + trainer.npcId, npcName: trainer.name, suffix: " in " + trainer.zone, coordinates: "", mapAttributes: {}, classes: "recipe-source-line" };
  if (trainer.x !== null && trainer.y !== null) {
    line.coordinates = " (" + trainer.x.toFixed(1) + ", " + trainer.y.toFixed(1) + ")";
  }
  line.mapAttributes = mapTargetAttributes(trainer.zone, trainer.x, trainer.y, trainer.name);
  if (line.mapAttributes["data-map-zone"] !== undefined) {
    line.classes = "recipe-source-line has-map";
  }
  return line;
}

export function trainerSource(profession: string, rankName: string): RecipeSourceView {
  const title = trainerTitle(profession, rankName);
  if (title === null) {
    return { text: "Any " + profession + " trainer", lines: [] };
  }
  const trainers = ownFactionTrainers(title);
  if (trainers.length === 0) {
    return { text: "An " + title, lines: [] };
  }
  return {
    text: "",
    lines: trainers.slice(0, RECIPE_SOURCES_SHOWN).map(function lineFor(trainer, index) {
      return trainerLine(title, trainer, index);
    })
  };
}
