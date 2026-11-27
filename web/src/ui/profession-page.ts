import { reactive } from "vue";
import "../legacy.ts";
import { buildGuide, professionRecipes, stepName, sumMaterials } from "../profession-guide.ts";
import type { GuideMaterial, GuideStep, MaterialPricing } from "../profession-guide.ts";
import type { Recipe } from "../crafting-plan.ts";
import { professionOf, saveSettings, selectedCharacter, snapshotOf } from "../state.ts";
import type { Character, SavedGuide } from "../types.ts";
import { recipeSource } from "./recipe-sources.ts";
import type { RecipeSourceView } from "./recipe-sources.ts";

export const PROFESSIONS = ["Alchemy", "Blacksmithing", "Cooking", "Enchanting", "Engineering", "First Aid", "Leatherworking", "Tailoring"];
export const MAX_SKILL = 300;

export const guideForm = reactive({ profession: "", from: 1, to: MAX_SKILL });

export function characterSkill(character: Character | null, profession: string): number | null {
  const entry = professionOf(snapshotOf(character), profession);
  if (entry === null || entry.skillPoints === undefined) {
    return null;
  }
  return entry.skillPoints;
}

export function knownRecipeIds(character: Character | null, profession: string): number[] {
  const entry = professionOf(snapshotOf(character), profession);
  if (entry === null) {
    return [];
  }
  return entry.recipeIds || [];
}

export function characterProfessions(character: Character | null): string[] {
  const snapshot = snapshotOf(character);
  if (snapshot === null) {
    return [];
  }
  return snapshot.professions.map(function nameOf(entry) {
    return entry.name;
  }).filter(function isSupported(name) {
    return PROFESSIONS.indexOf(name) !== -1;
  });
}

export function savedGuide(character: Character | null, profession: string): SavedGuide | null {
  if (character === null || !character.professionGuides) {
    return null;
  }
  return character.professionGuides[profession] || null;
}

export function chooseProfession(profession: string): void {
  guideForm.profession = profession;
  const skill = characterSkill(selectedCharacter(), profession);
  guideForm.from = Math.max(1, skill || 1);
  guideForm.to = MAX_SKILL;
}

export function startGuidePage(): void {
  const professions = characterProfessions(selectedCharacter());
  if (professions.length > 0) {
    chooseProfession(professions[0]);
    return;
  }
  chooseProfession(PROFESSIONS[0]);
}

export function makeGuide(): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  const from = Math.max(1, Math.min(MAX_SKILL - 1, Math.floor(guideForm.from)));
  const to = Math.max(from + 1, Math.min(MAX_SKILL, Math.floor(guideForm.to)));
  const guide = buildGuide(guideForm.profession, from, to, knownRecipeIds(character, guideForm.profession));
  if (!character.professionGuides) {
    character.professionGuides = {};
  }
  character.professionGuides[guideForm.profession] = { createdAt: Date.now(), guide: guide, doneSteps: [], boughtItemIds: [] };
  saveSettings();
}

export function discardGuide(profession: string): void {
  const character = selectedCharacter();
  if (character === null || !character.professionGuides) {
    return;
  }
  delete character.professionGuides[profession];
  saveSettings();
}

function toggled(list: number[], value: number): number[] {
  if (list.indexOf(value) === -1) {
    return list.concat([value]);
  }
  return list.filter(function isOther(entry) {
    return entry !== value;
  });
}

export function toggleStep(saved: SavedGuide, index: number): void {
  saved.doneSteps = toggled(saved.doneSteps, index);
  saveSettings();
}

export function toggleBought(saved: SavedGuide, itemId: number): void {
  saved.boughtItemIds = toggled(saved.boughtItemIds, itemId);
  saveSettings();
}

export function isStepDone(saved: SavedGuide, step: GuideStep, index: number, skill: number | null): boolean {
  if (saved.doneSteps.indexOf(index) !== -1) {
    return true;
  }
  return skill !== null && skill >= step.to;
}

function plannedMaterial(saved: SavedGuide, itemId: number): GuideMaterial | null {
  for (const material of saved.guide.materials) {
    if (material.itemId === itemId) {
      return material;
    }
  }
  return null;
}

function plannedPricing(saved: SavedGuide): MaterialPricing {
  function plannedUnitCost(itemId: number): number {
    const material = plannedMaterial(saved, itemId);
    if (material === null || material.quantity === 0) {
      return 0;
    }
    return material.cost / material.quantity;
  }
  function plannedAsCrafted(itemId: number): boolean {
    const material = plannedMaterial(saved, itemId);
    return material !== null && Boolean(material.craft);
  }
  return { unitCost: plannedUnitCost, isCrafted: plannedAsCrafted };
}

export function materialsLeft(saved: SavedGuide, skill: number | null): GuideMaterial[] {
  const stepsLeft = saved.guide.steps.filter(function isLeft(step, index) {
    return !isStepDone(saved, step, index, skill);
  });
  return sumMaterials(stepsLeft, plannedPricing(saved));
}

function recipeById(profession: string, recipeId: number): Recipe | null {
  for (const recipe of professionRecipes(profession)) {
    if (recipe.id === recipeId) {
      return recipe;
    }
  }
  return null;
}

export interface ProfessionChoice {
  name: string;
  label: string;
}

export function professionChoices(character: Character | null): ProfessionChoice[] {
  const own = characterProfessions(character);
  const others = PROFESSIONS.filter(function isNotOwn(name) {
    return own.indexOf(name) === -1;
  });
  return own.map(function ownOption(name) {
    return { name: name, label: name + " (yours)" };
  }).concat(others.map(function otherOption(name) {
    return { name: name, label: name };
  }));
}

export function skillLine(profession: string, skill: number | null): string {
  if (skill === null) {
    return "";
  }
  return "Your " + profession + " skill on Battle.net: " + skill + ". Steps up to it are ticked by themselves after a Refresh.";
}

export interface StepRow {
  key: string;
  index: number;
  step: GuideStep;
  done: boolean;
}

export function stepRows(saved: SavedGuide, skill: number | null): StepRow[] {
  return saved.guide.steps.map(function rowOf(step, index) {
    return { key: index + ":" + step.recipeId, index: index, step: step, done: isStepDone(saved, step, index, skill) };
  });
}

export interface GuideSummary {
  title: string;
  made: string;
  progress: string;
  total: number;
  stuck: string;
}

function isDoneRow(row: StepRow): boolean {
  return row.done;
}

export function guideSummary(saved: SavedGuide, rows: StepRow[]): GuideSummary {
  const guide = saved.guide;
  let stuck = "";
  if (guide.stuckAt !== null) {
    stuck = "No recipe with known prices gives skill at " + guide.stuckAt + ". Connect your WoW folder for more prices, or check the auction house for patterns.";
  }
  return {
    title: guide.profession + " " + guide.from + " → " + guide.to,
    made: "Planned on " + new Date(saved.createdAt).toLocaleString() + " with that day's prices. Make a new plan to use today's.",
    progress: rows.filter(isDoneRow).length + " of " + guide.steps.length + " steps done",
    total: guide.total,
    stuck: stuck
  };
}

export interface LessonRow {
  key: number;
  name: string;
  where: string;
  cost: number;
  hasCost: boolean;
  source: RecipeSourceView | null;
}

export function lessonRows(saved: SavedGuide): LessonRow[] {
  return saved.guide.lessons.map(function rowOf(lesson) {
    const recipe = recipeById(saved.guide.profession, lesson.recipeId);
    let source: RecipeSourceView | null = null;
    if (recipe !== null && recipe.teachingItemId) {
      source = recipeSource(recipe);
    }
    let where = "At a trainer, at skill " + lesson.learnAt;
    if (lesson.teachingItemId !== null) {
      where = "Pattern, usable at skill " + lesson.learnAt;
    }
    return { key: lesson.recipeId, name: stepName(lesson.recipeId, lesson.itemId), where: where, cost: lesson.cost, hasCost: lesson.cost > 0, source: source };
  });
}

export interface MaterialRow {
  key: number;
  itemId: number;
  inputId: string;
  quantity: string;
  cost: number;
  bought: boolean;
  how: string;
}

export function materialRows(saved: SavedGuide, skill: number | null): MaterialRow[] {
  return materialsLeft(saved, skill).map(function rowOf(material) {
    let how = "";
    if (material.craft) {
      how = "Cheaper to craft";
    }
    return { key: material.itemId, itemId: material.itemId, inputId: "material-" + material.itemId, quantity: material.quantity + "×", cost: material.cost, bought: saved.boughtItemIds.indexOf(material.itemId) !== -1, how: how };
  });
}

function addUnboughtCost(total: number, row: MaterialRow): number {
  if (row.bought) {
    return total;
  }
  return total + row.cost;
}

export function costStillToBuy(rows: MaterialRow[]): number {
  return rows.reduce(addUnboughtCost, 0);
}
