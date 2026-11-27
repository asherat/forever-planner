import { reactive } from "vue";
import "../legacy.ts";
import { SKILL_RANKS, buildGuide, professionRecipes, skillRankAt, stepName, sumMaterials } from "../profession-guide.ts";
import type { GuideLesson, GuideMaterial, GuideStep, MaterialPricing, SkillRank } from "../profession-guide.ts";
import type { Recipe } from "../crafting-plan.ts";
import { professionOf, saveSettings, selectedCharacter, snapshotOf, state } from "../state.ts";
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

function boughtKey(rank: SkillRank, itemId: number): string {
  return rank.name + ":" + itemId;
}

function stageKeysOfBoughtItems(saved: SavedGuide, boughtItemIds: number[]): string[] {
  const keys: string[] = [];
  for (const step of saved.guide.steps) {
    for (const reagent of step.reagents) {
      const key = boughtKey(skillRankAt(step.from), reagent[0]);
      if (boughtItemIds.indexOf(reagent[0]) !== -1 && keys.indexOf(key) === -1) {
        keys.push(key);
      }
    }
  }
  return keys;
}

function moveBoughtItemsToStages(): void {
  let hasMoved = false;
  for (const character of state.settings.characters) {
    for (const saved of Object.values(character.professionGuides || {})) {
      if (saved.boughtItemIds !== undefined) {
        saved.boughtMaterials = stageKeysOfBoughtItems(saved, saved.boughtItemIds);
        delete saved.boughtItemIds;
        hasMoved = true;
      }
    }
  }
  if (hasMoved) {
    saveSettings();
  }
}

export function startGuidePage(): void {
  moveBoughtItemsToStages();
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
  character.professionGuides[guideForm.profession] = { createdAt: Date.now(), guide: guide, doneSteps: [], boughtMaterials: [] };
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

function toggled<Value>(list: Value[], value: Value): Value[] {
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

export function toggleBought(saved: SavedGuide, key: string): void {
  saved.boughtMaterials = toggled(saved.boughtMaterials, key);
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

function stepRows(saved: SavedGuide, skill: number | null): StepRow[] {
  return saved.guide.steps.map(function rowOf(step, index) {
    return { key: index + ":" + step.recipeId, index: index, step: step, done: isStepDone(saved, step, index, skill) };
  });
}

export interface LessonRow {
  key: number;
  name: string;
  where: string;
  cost: number;
  hasCost: boolean;
  source: RecipeSourceView | null;
}

function lessonRow(profession: string, lesson: GuideLesson): LessonRow {
  const recipe = recipeById(profession, lesson.recipeId);
  let source: RecipeSourceView | null = null;
  if (recipe !== null && recipe.teachingItemId) {
    source = recipeSource(recipe);
  }
  let where = "At a trainer, at skill " + lesson.learnAt;
  if (lesson.teachingItemId !== null) {
    where = "Pattern, usable at skill " + lesson.learnAt;
  }
  return { key: lesson.recipeId, name: stepName(lesson.recipeId, lesson.itemId), where: where, cost: lesson.cost, hasCost: lesson.cost > 0, source: source };
}

export interface MaterialRow {
  key: string;
  itemId: number;
  inputId: string;
  count: number;
  quantity: string;
  cost: number;
  bought: boolean;
  how: string;
}

function craftHint(material: GuideMaterial): string {
  if (material.craft) {
    return "Cheaper to craft";
  }
  return "";
}

function isLeftRow(row: StepRow): boolean {
  return !row.done;
}

function stepOfRow(row: StepRow): GuideStep {
  return row.step;
}

function materialRows(saved: SavedGuide, rank: SkillRank, steps: StepRow[]): MaterialRow[] {
  const stepsLeft = steps.filter(isLeftRow).map(stepOfRow);
  return sumMaterials(stepsLeft, plannedPricing(saved)).map(function rowOf(material) {
    const key = boughtKey(rank, material.itemId);
    return { key: key, itemId: material.itemId, inputId: "material-" + rank.name + "-" + material.itemId, count: material.quantity, quantity: material.quantity + "×", cost: material.cost, bought: saved.boughtMaterials.indexOf(key) !== -1, how: craftHint(material) };
  });
}

function addUnboughtCost(total: number, row: MaterialRow): number {
  if (row.bought) {
    return total;
  }
  return total + row.cost;
}

function isBoughtRow(row: MaterialRow): boolean {
  return row.bought;
}

export interface StageRow {
  key: string;
  title: string;
  training: string;
  cost: number;
  runningTotal: number;
  steps: StepRow[];
  lessons: LessonRow[];
  hasLessons: boolean;
  materials: MaterialRow[];
  hasMaterials: boolean;
  allBought: boolean;
  tickAllLabel: string;
  stillToBuy: number;
}

function trainingLine(rank: SkillRank, planFrom: number): string {
  if (rank === SKILL_RANKS[0] || planFrom > rank.from) {
    return "";
  }
  return "Before " + rank.from + ": train " + rank.name + " at your trainer. You can from skill " + rank.trainFrom + " and character level " + rank.characterLevel + ".";
}

function addStepCost(total: number, row: StepRow): number {
  return total + row.step.cost;
}

function addLessonCost(total: number, lesson: GuideLesson): number {
  return total + lesson.cost;
}

function tickAllLabel(allBought: boolean): string {
  if (allBought) {
    return "Untick all";
  }
  return "Tick all";
}

export function stageRows(saved: SavedGuide, skill: number | null): StageRow[] {
  const guide = saved.guide;
  const steps = stepRows(saved, skill);
  const stages: StageRow[] = [];
  let runningTotal = 0;
  for (const rank of SKILL_RANKS) {
    const stageSteps = steps.filter(function isInRank(row) {
      return skillRankAt(row.step.from) === rank;
    });
    const stageLessons = guide.lessons.filter(function isInRank(lesson) {
      return skillRankAt(lesson.learnAt) === rank;
    });
    if (stageSteps.length === 0 && stageLessons.length === 0) {
      continue;
    }
    const cost = stageSteps.reduce(addStepCost, 0) + stageLessons.reduce(addLessonCost, 0);
    runningTotal += cost;
    const materials = materialRows(saved, rank, stageSteps);
    const allBought = materials.length > 0 && materials.every(isBoughtRow);
    stages.push({
      key: rank.name,
      title: rank.name + " " + Math.max(rank.from, guide.from) + " → " + Math.min(rank.to, guide.to),
      training: trainingLine(rank, guide.from),
      cost: cost,
      runningTotal: runningTotal,
      steps: stageSteps,
      lessons: stageLessons.map(function rowOf(lesson) {
        return lessonRow(guide.profession, lesson);
      }),
      hasLessons: stageLessons.length > 0,
      materials: materials,
      hasMaterials: materials.length > 0,
      allBought: allBought,
      tickAllLabel: tickAllLabel(allBought),
      stillToBuy: materials.reduce(addUnboughtCost, 0)
    });
  }
  return stages;
}

function keyOfRow(row: MaterialRow): string {
  return row.key;
}

export function toggleStageBought(saved: SavedGuide, stage: StageRow): void {
  const keys = stage.materials.map(keyOfRow);
  saved.boughtMaterials = saved.boughtMaterials.filter(function isOtherStage(key) {
    return keys.indexOf(key) === -1;
  });
  if (!stage.allBought) {
    saved.boughtMaterials = saved.boughtMaterials.concat(keys);
  }
  saveSettings();
}

export interface ShoppingRow {
  key: number;
  itemId: number;
  quantity: string;
  cost: number;
  how: string;
}

function compareShoppingRows(first: ShoppingRow, second: ShoppingRow): number {
  return second.cost - first.cost;
}

export function shoppingRows(stages: StageRow[]): ShoppingRow[] {
  const counts = new Map<number, number>();
  const rows = new Map<number, ShoppingRow>();
  for (const stage of stages) {
    for (const material of stage.materials) {
      if (material.bought) {
        continue;
      }
      const count = (counts.get(material.itemId) || 0) + material.count;
      const row = rows.get(material.itemId) || { key: material.itemId, itemId: material.itemId, quantity: "", cost: 0, how: material.how };
      row.cost += material.cost;
      row.quantity = count + "×";
      counts.set(material.itemId, count);
      rows.set(material.itemId, row);
    }
  }
  return Array.from(rows.values()).sort(compareShoppingRows);
}

function addStageStillToBuy(total: number, stage: StageRow): number {
  return total + stage.stillToBuy;
}

export function costStillToBuy(stages: StageRow[]): number {
  return stages.reduce(addStageStillToBuy, 0);
}

export interface GuideSummary {
  title: string;
  made: string;
  progress: string;
  total: number;
  stuck: string;
}

function countDoneSteps(total: number, stage: StageRow): number {
  return total + stage.steps.filter(function isDone(row) {
    return row.done;
  }).length;
}

export function guideSummary(saved: SavedGuide, stages: StageRow[]): GuideSummary {
  const guide = saved.guide;
  let stuck = "";
  if (guide.stuckAt !== null) {
    stuck = "No recipe with known prices gives skill at " + guide.stuckAt + ". Connect your WoW folder for more prices, or check the auction house for patterns.";
  }
  return {
    title: guide.profession + " " + guide.from + " → " + guide.to,
    made: "Planned on " + new Date(saved.createdAt).toLocaleString() + " with that day's prices. Make a new plan to use today's.",
    progress: stages.reduce(countDoneSteps, 0) + " of " + guide.steps.length + " steps done",
    total: guide.total,
    stuck: stuck
  };
}
