import "./legacy.ts";
import type { CraftingEntry, Plan, PlanMode, Recipe } from "./crafting-plan.ts";
import { MAX_RECIPE_DEPTH, buyOffer, cheapestRecipeFor, clearMarketCache, collectNodes, createStockPool, isCheaperToCraft, marketCost, planEntries } from "./crafting-plan.ts";

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

export function stepName(recipeId: number, itemId: number): string {
  const item = window.FOREVER_CRAFTING_ITEMS[itemId];
  if (item) {
    return item.name;
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
  step.cost = step.crafts * step.unitCost;
  return step;
}

function compareByCost(first: GuideMaterial, second: GuideMaterial): number {
  return second.cost - first.cost;
}

export function buildGuide(profession: string, from: number, to: number, knownRecipeIds: number[], canCraft: CraftCheck): Guide {
  clearMarketCache();
  const candidates = candidatesFor(profession, knownRecipeIds, canCraft);
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
    if (step === null || startsNewStep(step, candidate.recipe.id, skill)) {
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
  guide.materials = sumMaterials(guide.steps, marketPricing(canCraft));
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
  const guide = buildGuide(profession, 1, COMPARED_SKILLS[COMPARED_SKILLS.length - 1], [], canCraft);
  return COMPARED_SKILLS.map(function costTo(skill) {
    if (guide.stuckAt !== null && guide.stuckAt < skill) {
      return null;
    }
    return costUpTo(guide, skill);
  });
}

function stepEntries(step: GuideStep): CraftingEntry[] {
  return step.reagents.map(function entryOf(reagent) {
    return { itemId: reagent[0], quantity: reagent[1] * step.crafts };
  });
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
