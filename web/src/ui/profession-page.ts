import { reactive } from "vue";
import "../legacy.ts";
import { COMPARED_SKILLS, MADE_EARLIER, SKILL_RANKS, buildGuide, levelingCosts, planStepMaterials, professionRecipes, skillRankAt, stepCraftCheck, stepName, toolCategory } from "../profession-guide.ts";
import type { CraftCheck, Guide, GuideLesson, GuideStep, SkillRank } from "../profession-guide.ts";
import { INVENTORY_PLACES, aggregatePlans, collectNodes, craftingItem, includedInventoryCharacters } from "../crafting-plan.ts";
import type { Plan, Recipe, ShoppingLine, TakingLine } from "../crafting-plan.ts";
import { takingPlaces } from "./inventory-text.ts";
import { readWowFolder } from "../folder-data.ts";
import { professionOf, saveSettings, selectedCharacter, setStatus, snapshotOf, state } from "../state.ts";
import type { Character, SavedGuide } from "../types.ts";
import { recipeSource, trainerSource } from "./recipe-sources.ts";
import { qualityClass } from "../prices.ts";
import type { Tooltip } from "./upgrade-card.ts";
import type { RecipeSourceView } from "./recipe-sources.ts";

export const PROFESSIONS = ["Alchemy", "Blacksmithing", "Cooking", "Enchanting", "Engineering", "First Aid", "Leatherworking", "Tailoring"];
export const MAX_SKILL = 300;
const SECONDARY_PROFESSIONS = ["Cooking", "First Aid", "Fishing"];
const PRIMARY_PROFESSION_LIMIT = 2;

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

function reportFolderError(error: Error): void {
  setStatus("Could not read your WoW folder: " + error.message, "error");
}

export function chooseCharacter(slug: string): void {
  state.settings.selectedCharacterSlug = slug;
  saveSettings();
  chooseProfession(professionChoices(selectedCharacter())[0].name);
  readWowFolder(false).catch(reportFolderError);
}

export function startGuidePage(): void {
  moveBoughtItemsToStages();
  chooseProfession(professionChoices(selectedCharacter())[0].name);
}

function ownedToolCategories(): number[] {
  const categories: number[] = [];
  for (const character of includedInventoryCharacters()) {
    for (const place of INVENTORY_PLACES) {
      for (const itemId of Object.keys(character[place])) {
        const categoryId = window.FOREVER_TOOLS.items[itemId];
        if (categoryId !== undefined && categories.indexOf(categoryId) === -1) {
          categories.push(categoryId);
        }
      }
    }
  }
  return categories;
}

export function makeGuide(): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  const from = Math.max(1, Math.min(MAX_SKILL - 1, Math.floor(guideForm.from)));
  const to = Math.max(from + 1, Math.min(MAX_SKILL, Math.floor(guideForm.to)));
  const guide = buildGuide(guideForm.profession, from, to, { knownRecipeIds: knownRecipeIds(character, guideForm.profession), canCraft: canCraftFor(character, guideForm.profession), ownedTools: ownedToolCategories() });
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

function isSecondary(name: string): boolean {
  return SECONDARY_PROFESSIONS.indexOf(name) !== -1;
}

function primaryCount(character: Character | null): number {
  const snapshot = snapshotOf(character);
  if (snapshot === null) {
    return 0;
  }
  return snapshot.professions.filter(function isPrimary(entry) {
    return !isSecondary(entry.name);
  }).length;
}

function plainChoice(name: string): ProfessionChoice {
  return { name: name, label: name };
}

export function professionChoices(character: Character | null): ProfessionChoice[] {
  const own = characterProfessions(character);
  const others = PROFESSIONS.filter(function isNotOwn(name) {
    return own.indexOf(name) === -1;
  });
  if (primaryCount(character) >= PRIMARY_PROFESSION_LIMIT) {
    return own.concat(others.filter(isSecondary)).map(plainChoice);
  }
  return own.map(function ownOption(name) {
    return { name: name, label: name + " (yours)" };
  }).concat(others.map(plainChoice));
}

export interface ComparisonCell {
  key: number;
  copper: number;
  hasCost: boolean;
}

export interface ComparisonRow {
  key: string;
  name: string;
  cells: ComparisonCell[];
}

export const comparison = reactive({ characterSlug: "", rows: [] as ComparisonRow[] });

export const COMPARED_RANGES = COMPARED_SKILLS.map(function rangeOf(skill) {
  return "1 → " + skill;
});

function comparisonRow(character: Character | null, profession: string): ComparisonRow {
  const costs = levelingCosts(profession, canCraftFor(character, profession));
  return {
    key: profession,
    name: profession,
    cells: costs.map(function cellOf(cost, index) {
      return { key: COMPARED_SKILLS[index], copper: cost || 0, hasCost: cost !== null };
    })
  };
}

function fullCost(row: ComparisonRow): number {
  const last = row.cells[row.cells.length - 1];
  if (!last.hasCost) {
    return Infinity;
  }
  return last.copper;
}

function compareRowsByCost(first: ComparisonRow, second: ComparisonRow): number {
  return fullCost(first) - fullCost(second);
}

export function compareProfessions(): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  comparison.rows = professionChoices(character).filter(function isPrimary(choice) {
    return !isSecondary(choice.name);
  }).map(function rowOf(choice) {
    return comparisonRow(character, choice.name);
  }).sort(compareRowsByCost);
  comparison.characterSlug = character.slug;
}

export function comparisonRows(character: Character | null): ComparisonRow[] {
  if (character === null || comparison.characterSlug !== character.slug) {
    return [];
  }
  return comparison.rows;
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
  craftFirst: string;
  keep: string;
  uses: string;
  recipe: Tooltip;
  tools: string;
}

function toolsText(profession: string, step: GuideStep): string {
  const recipe = recipeById(profession, step.recipeId);
  if (recipe === null || !recipe.tools) {
    return "";
  }
  return "Needs: " + recipe.tools.map(function nameOf(categoryId) {
    return toolCategory(categoryId).name;
  }).join(", ");
}

function recipeTooltip(profession: string, step: GuideStep): Tooltip {
  const recipe = recipeById(profession, step.recipeId);
  let makes = 1;
  if (recipe !== null) {
    makes = recipe.quantity;
  }
  let subtitle = "One craft makes " + makes + " and takes:";
  let titleClass = "";
  if (step.itemId === null) {
    subtitle = "One enchant takes:";
  } else {
    titleClass = qualityClass(craftingItem(step.itemId).quality);
  }
  return {
    title: stepName(step.recipeId, step.itemId),
    titleClass: titleClass,
    subtitle: subtitle,
    lines: step.reagents.map(function lineOf(reagent) {
      return { className: "", text: reagent[1] + "× " + craftingItem(reagent[0]).name };
    })
  };
}

function craftFirstText(plans: Plan[], profession: string): string {
  const counts = new Map<number, number>();
  let givesSkill = false;
  for (const plan of plans) {
    for (const node of collectNodes(plan.root, []).reverse()) {
      if (node.recipe !== null && node.craftCount > 0) {
        counts.set(node.itemId, (counts.get(node.itemId) || 0) + node.craftCount);
        givesSkill = givesSkill || (node.recipe.profession === profession && window.FOREVER_TOOLS.items[plan.entry.itemId] === undefined);
      }
    }
  }
  const parts: string[] = [];
  counts.forEach(function partOf(count, itemId) {
    parts.push(count + "× " + craftingItem(itemId).name);
  });
  if (parts.length === 0) {
    return "";
  }
  if (givesSkill) {
    return "Craft first, for skill too: " + parts.join(", ");
  }
  return "Craft first: " + parts.join(", ");
}

function canCraftFor(character: Character | null, profession: string): CraftCheck {
  const snapshot = snapshotOf(character);
  return function canCraft(recipe: Recipe): boolean {
    return recipe.profession === profession || professionOf(snapshot, recipe.profession) !== null;
  };
}

function stepRange(step: GuideStep): string {
  return step.from + " → " + step.to;
}

function addKeptProducts(rowsLeft: StepRow[], consumer: StepRow, plans: Plan[]): void {
  const used = new Map<number, number>();
  const kept = new Map<StepRow, number>();
  for (const plan of plans) {
    for (const node of collectNodes(plan.root, [])) {
      for (const taken of node.taken) {
        if (taken.character === MADE_EARLIER) {
          const producer = rowsLeft[Number(taken.place)];
          used.set(node.itemId, (used.get(node.itemId) || 0) + taken.count);
          kept.set(producer, (kept.get(producer) || 0) + taken.count);
        }
      }
    }
  }
  const uses: string[] = [];
  used.forEach(function partOf(count, itemId) {
    uses.push(count + "× " + craftingItem(itemId).name);
  });
  if (uses.length > 0) {
    consumer.uses = "Uses " + uses.join(", ") + " you made earlier";
  }
  kept.forEach(function noteOn(count, producer) {
    const note = count + " for " + stepName(consumer.step.recipeId, consumer.step.itemId) + " (" + stepRange(consumer.step) + ")";
    if (producer.keep === "") {
      producer.keep = "Keep " + note;
    } else {
      producer.keep += ", " + note;
    }
  });
}

function plannedStepRows(saved: SavedGuide, skill: number | null, character: Character | null): { rows: StepRow[]; plans: Map<number, Plan[]> } {
  const rows: StepRow[] = saved.guide.steps.map(function rowOf(step, index) {
    return { key: index + ":" + step.recipeId, index: index, step: step, done: isStepDone(saved, step, index, skill), craftFirst: "", keep: "", uses: "", recipe: recipeTooltip(saved.guide.profession, step), tools: toolsText(saved.guide.profession, step) };
  });
  const rowsLeft = rows.filter(function isLeft(row) {
    return !row.done;
  });
  const planned = planStepMaterials(rowsLeft.map(function stepOf(row) {
    return row.step;
  }), stepCraftCheck(saved.guide.profession, knownRecipeIds(character, saved.guide.profession), canCraftFor(character, saved.guide.profession)));
  const plans = new Map<number, Plan[]>();
  rowsLeft.forEach(function attach(row, position) {
    row.craftFirst = craftFirstText(planned[position], saved.guide.profession);
    addKeptProducts(rowsLeft, row, planned[position]);
    plans.set(row.index, planned[position]);
  });
  return { rows: rows, plans: plans };
}

export interface LessonRow {
  key: number;
  name: string;
  where: string;
  cost: number;
  hasCost: boolean;
  source: RecipeSourceView;
}

function lessonRow(profession: string, lesson: GuideLesson): LessonRow {
  const recipe = recipeById(profession, lesson.recipeId);
  let source: RecipeSourceView;
  let where: string;
  if (recipe !== null && recipe.teachingItemId) {
    source = recipeSource(recipe);
    where = "Pattern, usable at skill " + lesson.learnAt;
  } else {
    source = trainerSource(profession, skillRankAt(lesson.learnAt).name);
    where = "From a trainer at skill " + lesson.learnAt;
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
  hasPrice: boolean;
  bought: boolean;
}

function materialRow(saved: SavedGuide, rank: SkillRank, line: ShoppingLine): MaterialRow {
  const key = boughtKey(rank, line.itemId);
  return { key: key, itemId: line.itemId, inputId: "material-" + rank.name + "-" + line.itemId, count: line.quantity, quantity: line.quantity + "×", cost: line.cost, hasPrice: line.offer !== null, bought: saved.boughtMaterials.indexOf(key) !== -1 };
}

export interface TakingRow {
  key: string;
  itemId: number;
  quantity: string;
  places: string;
}

function takingRow(line: TakingLine): TakingRow {
  return { key: line.character + "|" + line.itemId, itemId: line.itemId, quantity: line.count + "×", places: takingPlaces(line) };
}

function isFromACharacter(line: TakingLine): boolean {
  return line.character !== MADE_EARLIER;
}

function compareByCost(first: MaterialRow, second: MaterialRow): number {
  return second.cost - first.cost;
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
  trainers: RecipeSourceView | null;
  cost: number;
  runningTotal: number;
  steps: StepRow[];
  lessons: LessonRow[];
  hasLessons: boolean;
  materials: MaterialRow[];
  hasMaterials: boolean;
  taking: TakingRow[];
  hasTaking: boolean;
  allBought: boolean;
  tickAllLabel: string;
  stillToBuy: number;
}

function needsTraining(rank: SkillRank, planFrom: number): boolean {
  return rank !== SKILL_RANKS[0] && planFrom <= rank.from;
}

function trainingLine(rank: SkillRank, planFrom: number): string {
  if (!needsTraining(rank, planFrom)) {
    return "";
  }
  return "Before " + rank.from + ": train " + rank.name + ". You can from skill " + rank.trainFrom + " and character level " + rank.characterLevel + ".";
}

function trainersFor(rank: SkillRank, guide: Guide): RecipeSourceView | null {
  if (!needsTraining(rank, guide.from)) {
    return null;
  }
  return trainerSource(guide.profession, rank.name);
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

export function stageRows(saved: SavedGuide, skill: number | null, character: Character | null): StageRow[] {
  const guide = saved.guide;
  const planned = plannedStepRows(saved, skill, character);
  const steps = planned.rows;
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
    const stagePlans: Plan[] = [];
    for (const row of stageSteps) {
      stagePlans.push(...(planned.plans.get(row.index) || []));
    }
    const totals = aggregatePlans(stagePlans);
    const materials = totals.shopping.map(function rowOf(line) {
      return materialRow(saved, rank, line);
    }).sort(compareByCost);
    const taking = totals.taking.filter(isFromACharacter).map(takingRow);
    const allBought = materials.length > 0 && materials.every(isBoughtRow);
    stages.push({
      key: rank.name,
      title: rank.name + " " + Math.max(rank.from, guide.from) + " → " + Math.min(rank.to, guide.to),
      training: trainingLine(rank, guide.from),
      trainers: trainersFor(rank, guide),
      cost: cost,
      runningTotal: runningTotal,
      steps: stageSteps,
      lessons: stageLessons.map(function rowOf(lesson) {
        return lessonRow(guide.profession, lesson);
      }),
      hasLessons: stageLessons.length > 0,
      materials: materials,
      hasMaterials: materials.length > 0,
      taking: taking,
      hasTaking: taking.length > 0,
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
  hasPrice: boolean;
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
      const row = rows.get(material.itemId) || { key: material.itemId, itemId: material.itemId, quantity: "", cost: 0, hasPrice: material.hasPrice };
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
