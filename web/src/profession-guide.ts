import "./legacy.ts";
import type { Recipe } from "./crafting-plan.ts";
import { buyOffer, clearMarketCache, isCheaperToCraft, marketCost } from "./crafting-plan.ts";

export type RecipeLevels = [number, number, number, number];
export type RecipeColor = "orange" | "yellow" | "green" | "grey";

export interface GuideStep {
  recipeId: number;
  itemId: number;
  from: number;
  to: number;
  crafts: number;
  unitCost: number;
  cost: number;
  color: RecipeColor;
  reagents: [number, number][];
}

export interface GuideLesson {
  recipeId: number;
  itemId: number;
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

export function stepName(recipeId: number, itemId: number): string {
  const item = window.FOREVER_CRAFTING_ITEMS[itemId];
  if (item) {
    return item.name;
  }
  return window.FOREVER_RECIPE_NAMES[recipeId] || "Recipe " + recipeId;
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

function craftCost(recipe: Recipe): number | null {
  let total = 0;
  for (const reagent of recipe.reagents) {
    const unit = marketCost(reagent[0]);
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

function candidatesFor(profession: string, knownRecipeIds: number[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const recipe of professionRecipes(profession)) {
    const isKnown = knownRecipeIds.indexOf(recipe.id) !== -1;
    const unitCost = craftCost(recipe);
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

function costPerPoint(candidate: Candidate, skill: number, learned: Set<number>): number | null {
  if (!candidate.isKnown && !learned.has(candidate.recipe.id) && candidate.levels[0] > skill) {
    return null;
  }
  const chance = skillUpChance(candidate.levels, skill);
  if (chance <= 0) {
    return null;
  }
  let cost = candidate.unitCost / chance;
  if (!candidate.isKnown && !learned.has(candidate.recipe.id)) {
    cost += candidate.learnCost / Math.max(1, candidate.levels[2] - skill);
  }
  return cost;
}

function bestCandidate(candidates: Candidate[], skill: number, learned: Set<number>, current: Candidate | null): Candidate | null {
  let best: Candidate | null = null;
  let bestCost = Infinity;
  for (const candidate of candidates) {
    const cost = costPerPoint(candidate, skill, learned);
    if (cost !== null && cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  if (current !== null && best !== current) {
    const currentCost = costPerPoint(current, skill, learned);
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

function marketUnitCost(itemId: number): number {
  return marketCost(itemId) || 0;
}

const MARKET_PRICING: MaterialPricing = { unitCost: marketUnitCost, isCrafted: isCheaperToCraft };

function finishStep(step: GuideStep, expectedCrafts: number): GuideStep {
  step.crafts = Math.ceil(expectedCrafts - 0.0001);
  step.cost = step.crafts * step.unitCost;
  return step;
}

function compareByCost(first: GuideMaterial, second: GuideMaterial): number {
  return second.cost - first.cost;
}

export function buildGuide(profession: string, from: number, to: number, knownRecipeIds: number[]): Guide {
  clearMarketCache();
  const candidates = candidatesFor(profession, knownRecipeIds);
  const learned = new Set<number>();
  const guide: Guide = { profession: profession, from: from, to: to, steps: [], lessons: [], materials: [], total: 0, stuckAt: null };
  let step: GuideStep | null = null;
  let current: Candidate | null = null;
  let expectedCrafts = 0;
  for (let skill = from; skill < to; skill += 1) {
    const candidate = bestCandidate(candidates, skill, learned, current);
    current = candidate;
    if (candidate === null) {
      guide.stuckAt = skill;
      break;
    }
    if (!candidate.isKnown && !learned.has(candidate.recipe.id)) {
      learned.add(candidate.recipe.id);
      guide.lessons.push({ recipeId: candidate.recipe.id, itemId: candidate.recipe.itemId, learnAt: Math.max(skill, candidate.levels[0]), teachingItemId: candidate.recipe.teachingItemId || null, cost: candidate.learnCost });
    }
    if (step === null || step.recipeId !== candidate.recipe.id) {
      if (step !== null) {
        guide.steps.push(finishStep(step, expectedCrafts));
      }
      step = { recipeId: candidate.recipe.id, itemId: candidate.recipe.itemId, from: skill, to: skill, crafts: 0, unitCost: candidate.unitCost, cost: 0, color: recipeColor(candidate.levels, skill), reagents: candidate.recipe.reagents };
      expectedCrafts = 0;
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
  guide.materials = sumMaterials(guide.steps, MARKET_PRICING);
  return guide;
}
