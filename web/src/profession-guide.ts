import "./legacy.ts";
import type { CraftingEntry, Plan, PlanMode, Recipe } from "./crafting-plan.ts";
import { MAX_RECIPE_DEPTH, buyOffer, cheapestRecipeFor, clearMarketCache, collectNodes, createStockPool, isCheaperToCraft, marketCost, planEntries } from "./crafting-plan.ts";

export type RecipeLevels = [number, number, number, number];
export type RecipeColor = "orange" | "yellow" | "green" | "grey";

export interface ToolCategory {
  name: string;
  type: number;
  mask: number;
  itemId: number | null;
}

export interface Tools {
  categories: Record<string, ToolCategory>;
  items: Record<string, number>;
}

export interface GuideStep {
  recipeId: number;
  itemId: number | null;
  from: number;
  to: number;
  crafts: number;
  unitCost: number;
  cost: number;
  color: RecipeColor;
  reagents: [number, number][];
  tools?: number[];
  toolCost?: number;
}

export interface GuideOptions {
  knownRecipeIds: number[];
  canCraft: CraftCheck;
  ownedTools: number[];
}

export interface GuideLesson {
  recipeId: number;
  itemId: number | null;
  learnAt: number;
  teachingItemId: number | null;
  cost: number;
}

export interface GuideMaterial {
  itemId: number;
  quantity: number;
  cost: number;
  craft: boolean;
}

export interface Guide {
  profession: string;
  from: number;
  to: number;
  steps: GuideStep[];
  lessons: GuideLesson[];
  materials: GuideMaterial[];
  total: number;
  stuckAt: number | null;
}

export interface SkillRank {
  name: string;
  from: number;
  to: number;
  trainFrom: number;
  characterLevel: number;
}

export const SKILL_RANKS: SkillRank[] = [
  { name: "Apprentice", from: 1, to: 75, trainFrom: 1, characterLevel: 5 },
  { name: "Journeyman", from: 75, to: 150, trainFrom: 50, characterLevel: 10 },
  { name: "Expert", from: 150, to: 225, trainFrom: 125, characterLevel: 20 },
  { name: "Artisan", from: 225, to: 300, trainFrom: 200, characterLevel: 35 }
];

const SWITCH_SAVING = 0.1;

interface Candidate {
  recipe: Recipe;
  levels: RecipeLevels;
  unitCost: number;
  learnCost: number;
  isKnown: boolean;
}

export function recipeLevels(recipeId: number): RecipeLevels | null {
  return window.FOREVER_RECIPE_LEVELS[recipeId] || null;
}

export function stepName(recipeId: number, itemId: number | null): string {
  if (itemId !== null && window.FOREVER_CRAFTING_ITEMS[itemId]) {
    return window.FOREVER_CRAFTING_ITEMS[itemId].name;
  }
  return window.FOREVER_RECIPE_NAMES[recipeId] || "Recipe " + recipeId;
}

export function skillRankAt(skill: number): SkillRank {
  for (const rank of SKILL_RANKS) {
    if (skill < rank.to) {
      return rank;
    }
  }
  return SKILL_RANKS[SKILL_RANKS.length - 1];
}

function startsNewStep(step: GuideStep, recipeId: number, skill: number): boolean {
  return step.recipeId !== recipeId || skillRankAt(step.from) !== skillRankAt(skill);
}

export function recipeColor(levels: RecipeLevels, skill: number): RecipeColor {
  if (skill < levels[1]) {
    return "orange";
  }
  if (skill < levels[2]) {
    return "yellow";
  }
  if (skill < levels[3]) {
    return "green";
  }
  return "grey";
}

export function skillUpChance(levels: RecipeLevels, skill: number): number {
  if (skill >= levels[3]) {
    return 0;
  }
  if (skill < levels[1]) {
    return 1;
  }
  return (levels[3] - skill) / (levels[3] - levels[1]);
}

export function professionRecipes(profession: string): Recipe[] {
  return window.FOREVER_RECIPES.filter(function isOfProfession(recipe) {
    return recipe.profession === profession && recipeLevels(recipe.id) !== null;
  });
}

export type CraftCheck = (recipe: Recipe) => boolean;

function isBoughtInstead(itemId: number, canCraft: CraftCheck): boolean {
  const recipe = cheapestRecipeFor(itemId);
  return isCheaperToCraft(itemId) && recipe !== null && !canCraft(recipe) && buyOffer(itemId) !== null;
}

function materialCost(itemId: number, canCraft: CraftCheck): number | null {
  const offer = buyOffer(itemId);
  if (offer !== null && isBoughtInstead(itemId, canCraft)) {
    return offer.price;
  }
  return marketCost(itemId);
}

function craftCost(recipe: Recipe, canCraft: CraftCheck): number | null {
  let total = 0;
  for (const reagent of recipe.reagents) {
    const unit = materialCost(reagent[0], canCraft);
    if (unit === null) {
      return null;
    }
    total += unit * reagent[1];
  }
  return total;
}

function learnCost(recipe: Recipe): number | null {
  if (!recipe.teachingItemId) {
    return 0;
  }
  const offer = buyOffer(recipe.teachingItemId);
  if (offer === null) {
    return null;
  }
  return offer.price;
}

function candidatesFor(profession: string, knownRecipeIds: number[], canCraft: CraftCheck): Candidate[] {
  const candidates: Candidate[] = [];
  for (const recipe of professionRecipes(profession)) {
    const isKnown = knownRecipeIds.indexOf(recipe.id) !== -1;
    const unitCost = craftCost(recipe, canCraft);
    let learning: number | null = 0;
    if (!isKnown) {
      learning = learnCost(recipe);
    }
    if (unitCost === null || learning === null) {
      continue;
    }
    candidates.push({ recipe: recipe, levels: recipeLevels(recipe.id) as RecipeLevels, unitCost: unitCost, learnCost: learning, isKnown: isKnown });
  }
  return candidates;
}

export function toolCategory(categoryId: number): ToolCategory {
  return window.FOREVER_TOOLS.categories[categoryId];
}

function toolCovers(have: number, need: number): boolean {
  const owned = toolCategory(have);
  const wanted = toolCategory(need);
  return owned.type === wanted.type && (owned.mask & wanted.mask) === wanted.mask;
}

function missingTools(recipe: Recipe, obtained: number[]): number[] {
  return (recipe.tools || []).filter(function isMissing(need) {
    return !obtained.some(function covers(have) {
      return toolCovers(have, need);
    });
  });
}

function toolCost(categoryId: number): number | null {
  const itemId = toolCategory(categoryId).itemId;
  if (itemId === null) {
    return null;
  }
  return marketCost(itemId);
}

function missingToolsCost(recipe: Recipe, obtained: number[]): number | null {
  let total = 0;
  for (const need of missingTools(recipe, obtained)) {
    const price = toolCost(need);
    if (price === null) {
      return null;
    }
    total += price;
  }
  return total;
}

function costPerPoint(candidate: Candidate, skill: number, learned: Set<number>, obtained: number[]): number | null {
  if (!candidate.isKnown && !learned.has(candidate.recipe.id) && candidate.levels[0] > skill) {
    return null;
  }
  const chance = skillUpChance(candidate.levels, skill);
  const tools = missingToolsCost(candidate.recipe, obtained);
  if (chance <= 0 || tools === null) {
    return null;
  }
  const pointsAhead = Math.max(1, candidate.levels[2] - skill);
  let cost = candidate.unitCost / chance + tools / pointsAhead;
  if (!candidate.isKnown && !learned.has(candidate.recipe.id)) {
    cost += candidate.learnCost / pointsAhead;
  }
  return cost;
}

function bestCandidate(candidates: Candidate[], skill: number, learned: Set<number>, obtained: number[], current: Candidate | null): Candidate | null {
  let best: Candidate | null = null;
  let bestCost = Infinity;
  for (const candidate of candidates) {
    const cost = costPerPoint(candidate, skill, learned, obtained);
    if (cost !== null && cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  if (current !== null && best !== current) {
    const currentCost = costPerPoint(current, skill, learned, obtained);
    if (currentCost !== null && currentCost * (1 - SWITCH_SAVING) <= bestCost) {
      return current;
    }
  }
  return best;
}

export interface MaterialPricing {
  unitCost: (itemId: number) => number;
  isCrafted: (itemId: number) => boolean;
}

export function sumMaterials(steps: GuideStep[], pricing: MaterialPricing): GuideMaterial[] {
  const materials = new Map<number, GuideMaterial>();
  for (const step of steps) {
    for (const reagent of step.reagents) {
      const material = materials.get(reagent[0]) || { itemId: reagent[0], quantity: 0, cost: 0, craft: pricing.isCrafted(reagent[0]) };
      material.quantity += reagent[1] * step.crafts;
      material.cost += pricing.unitCost(reagent[0]) * reagent[1] * step.crafts;
      materials.set(reagent[0], material);
    }
  }
  return Array.from(materials.values()).sort(compareByCost);
}

function marketPricing(canCraft: CraftCheck): MaterialPricing {
  function unitCost(itemId: number): number {
    return materialCost(itemId, canCraft) || 0;
  }
  function isCrafted(itemId: number): boolean {
    return isCheaperToCraft(itemId) && !isBoughtInstead(itemId, canCraft);
  }
  return { unitCost: unitCost, isCrafted: isCrafted };
}

function finishStep(step: GuideStep, expectedCrafts: number): GuideStep {
  step.crafts = Math.ceil(expectedCrafts - 0.0001);
  step.cost = step.crafts * step.unitCost + (step.toolCost || 0);
  return step;
}

function lessonFor(candidate: Candidate, skill: number): GuideLesson {
  return { recipeId: candidate.recipe.id, itemId: candidate.recipe.itemId, learnAt: Math.max(skill, candidate.levels[0]), teachingItemId: candidate.recipe.teachingItemId || null, cost: candidate.learnCost };
}

function toolRecipe(candidates: Candidate[], categoryId: number): Candidate | null {
  const itemId = toolCategory(categoryId).itemId;
  for (const candidate of candidates) {
    if (candidate.recipe.itemId === itemId) {
      return candidate;
    }
  }
  return null;
}

function compareByCost(first: GuideMaterial, second: GuideMaterial): number {
  return second.cost - first.cost;
}

export function buildGuide(profession: string, from: number, to: number, options: GuideOptions): Guide {
  clearMarketCache();
  const candidates = candidatesFor(profession, options.knownRecipeIds, options.canCraft);
  const learned = new Set<number>();
  const obtained = options.ownedTools.slice();
  const guide: Guide = { profession: profession, from: from, to: to, steps: [], lessons: [], materials: [], total: 0, stuckAt: null };
  let step: GuideStep | null = null;
  let current: Candidate | null = null;
  let expectedCrafts = 0;
  for (let skill = from; skill < to; skill += 1) {
    const candidate = bestCandidate(candidates, skill, learned, obtained, current);
    current = candidate;
    if (candidate === null) {
      guide.stuckAt = skill;
      break;
    }
    if (!candidate.isKnown && !learned.has(candidate.recipe.id)) {
      learned.add(candidate.recipe.id);
      guide.lessons.push(lessonFor(candidate, skill));
    }
    const newTools = missingTools(candidate.recipe, obtained);
    if (step === null || startsNewStep(step, candidate.recipe.id, skill) || newTools.length > 0) {
      if (step !== null) {
        guide.steps.push(finishStep(step, expectedCrafts));
      }
      step = { recipeId: candidate.recipe.id, itemId: candidate.recipe.itemId, from: skill, to: skill, crafts: 0, unitCost: candidate.unitCost, cost: 0, color: recipeColor(candidate.levels, skill), reagents: candidate.recipe.reagents };
      expectedCrafts = 0;
    }
    if (newTools.length > 0) {
      step.tools = newTools;
      step.toolCost = missingToolsCost(candidate.recipe, obtained) || 0;
      for (const categoryId of newTools) {
        obtained.push(categoryId);
        const recipeForTool = toolRecipe(candidates, categoryId);
        if (recipeForTool !== null && !recipeForTool.isKnown && !learned.has(recipeForTool.recipe.id)) {
          learned.add(recipeForTool.recipe.id);
          guide.lessons.push(lessonFor(recipeForTool, skill));
        }
      }
    }
    expectedCrafts += 1 / skillUpChance(candidate.levels, skill);
    step.to = skill + 1;
  }
  if (step !== null) {
    guide.steps.push(finishStep(step, expectedCrafts));
  }
  for (const finished of guide.steps) {
    guide.total += finished.cost;
  }
  for (const lesson of guide.lessons) {
    guide.total += lesson.cost;
  }
  guide.materials = sumMaterials(guide.steps, marketPricing(options.canCraft));
  return guide;
}

export const COMPARED_SKILLS = [150, 225, 300];

function costUpTo(guide: Guide, skill: number): number {
  let total = 0;
  for (const step of guide.steps) {
    if (step.to <= skill) {
      total += step.cost;
    }
  }
  for (const lesson of guide.lessons) {
    if (lesson.learnAt < skill) {
      total += lesson.cost;
    }
  }
  return total;
}

export function levelingCosts(profession: string, canCraft: CraftCheck): (number | null)[] {
  const guide = buildGuide(profession, 1, COMPARED_SKILLS[COMPARED_SKILLS.length - 1], { knownRecipeIds: [], canCraft: canCraft, ownedTools: [] });
  return COMPARED_SKILLS.map(function costTo(skill) {
    if (guide.stuckAt !== null && guide.stuckAt < skill) {
      return null;
    }
    return costUpTo(guide, skill);
  });
}

function stepEntries(step: GuideStep): CraftingEntry[] {
  const entries = step.reagents.map(function entryOf(reagent) {
    return { itemId: reagent[0], quantity: reagent[1] * step.crafts };
  });
  for (const categoryId of step.tools || []) {
    const itemId = toolCategory(categoryId).itemId;
    if (itemId !== null) {
      entries.push({ itemId: itemId, quantity: 1 });
    }
  }
  return entries;
}

function planSteps(steps: GuideStep[], overrides: Record<string, PlanMode>): Plan[][] {
  const pool = createStockPool();
  return steps.map(function planned(step) {
    return planEntries(stepEntries(step), pool, overrides);
  });
}

function itemsToBuyInstead(planned: Plan[][], canCraft: CraftCheck, overrides: Record<string, PlanMode>): number[] {
  const itemIds: number[] = [];
  for (const plans of planned) {
    for (const plan of plans) {
      for (const node of collectNodes(plan.root, [])) {
        if (node.recipe !== null && !canCraft(node.recipe) && !overrides[node.itemId] && buyOffer(node.itemId) !== null && itemIds.indexOf(node.itemId) === -1) {
          itemIds.push(node.itemId);
        }
      }
    }
  }
  return itemIds;
}

export function planStepMaterials(steps: GuideStep[], canCraft: CraftCheck): Plan[][] {
  clearMarketCache();
  const overrides: Record<string, PlanMode> = {};
  let planned = planSteps(steps, overrides);
  for (let round = 0; round < MAX_RECIPE_DEPTH; round += 1) {
    const itemIds = itemsToBuyInstead(planned, canCraft, overrides);
    if (itemIds.length === 0) {
      break;
    }
    for (const itemId of itemIds) {
      overrides[itemId] = "buy";
    }
    planned = planSteps(steps, overrides);
  }
  return planned;
}
