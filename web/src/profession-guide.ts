import "./legacy.ts";
import type { CraftingEntry, Plan, PlanMode, Recipe, StockPool } from "./crafting-plan.ts";
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
  makes?: number;
  colorTo?: RecipeColor;
  craftedForPoints?: number[];
}

export interface GuideOptions {
  knownRecipeIds: number[];
  canCraft: CraftCheck;
  ownedTools: number[];
  usesCooldowns?: boolean;
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
  usesCooldowns?: boolean;
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
export const MADE_EARLIER = "made earlier";

interface RecipeInfo {
  recipe: Recipe;
  levels: RecipeLevels;
  learnCost: number | null;
  isKnown: boolean;
}

interface Part {
  info: RecipeInfo;
  perCraft: number;
}

interface CandidateInput {
  itemId: number;
  quantity: number;
  unitCost: number;
  parts: Part[];
  ownCraft: OwnCraft | null;
}

interface OwnCraft {
  unitCost: number;
  parts: Part[];
}

interface Candidate {
  info: RecipeInfo;
  inputs: CandidateInput[];
}

interface Priced {
  cost: number;
  recipe: Recipe | null;
}

interface Pricing {
  profession: string;
  canCraft: CraftCheck;
  usesCooldowns: boolean;
  infos: Map<number, RecipeInfo>;
  cache: Map<string, Priced | null>;
}

interface Bundle {
  cost: number;
  points: number;
  fromStock: CandidateInput[];
  parts: Part[];
  craftedForPoints: number[];
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

function startsNewStep(step: GuideStep, recipeId: number, skill: number, craftedForPoints: number[]): boolean {
  return step.recipeId !== recipeId || skillRankAt(step.from) !== skillRankAt(skill) || (step.craftedForPoints || []).join() !== craftedForPoints.join();
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
export type StepCraftCheck = (recipe: Recipe, step: GuideStep) => boolean;

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

function recipeInfos(profession: string, knownRecipeIds: number[]): Map<number, RecipeInfo> {
  const infos = new Map<number, RecipeInfo>();
  for (const recipe of professionRecipes(profession)) {
    infos.set(recipe.id, { recipe: recipe, levels: recipeLevels(recipe.id) as RecipeLevels, learnCost: learnCost(recipe), isKnown: knownRecipeIds.indexOf(recipe.id) !== -1 });
  }
  return infos;
}

function isLearnedBy(info: RecipeInfo | undefined, skill: number): boolean {
  return info === undefined || info.isKnown || (info.learnCost !== null && info.levels[0] <= skill);
}

function isOnAnUnusedCooldown(pricing: Pricing, recipe: Recipe): boolean {
  return Boolean(recipe.cooldown) && !pricing.usesCooldowns;
}

function canCraftAt(pricing: Pricing, recipe: Recipe, skill: number): boolean {
  if (isOnAnUnusedCooldown(pricing, recipe) || !pricing.canCraft(recipe)) {
    return false;
  }
  return recipe.profession !== pricing.profession || isLearnedBy(pricing.infos.get(recipe.id), skill);
}

function craftedPrice(pricing: Pricing, recipe: Recipe, skill: number, path: number[]): number | null {
  let total = 0;
  for (const reagent of recipe.reagents) {
    const reagentPrice = priceAt(pricing, reagent[0], skill, path);
    if (reagentPrice === null) {
      return null;
    }
    total += reagentPrice.cost * reagent[1];
  }
  return total / recipe.quantity;
}

function priceAt(pricing: Pricing, itemId: number, skill: number, path: number[]): Priced | null {
  const key = itemId + ":" + skill;
  const isOnPath = path.indexOf(itemId) !== -1;
  if (!isOnPath && pricing.cache.has(key)) {
    return pricing.cache.get(key) || null;
  }
  const offer = buyOffer(itemId);
  let best: Priced | null = null;
  if (offer !== null) {
    best = { cost: offer.price, recipe: null };
  }
  const recipe = cheapestRecipeFor(itemId);
  if (recipe !== null && !isOnPath && path.length < MAX_RECIPE_DEPTH && canCraftAt(pricing, recipe, skill)) {
    const crafted = craftedPrice(pricing, recipe, skill, path.concat([itemId]));
    if (crafted !== null && (best === null || crafted < best.cost)) {
      best = { cost: crafted, recipe: recipe };
    }
  }
  if (path.length === 0) {
    pricing.cache.set(key, best);
  }
  return best;
}

function addRecipeParts(pricing: Pricing, recipe: Recipe, quantity: number, skill: number, path: number[], parts: Part[]): void {
  const perCraft = quantity / recipe.quantity;
  const info = pricing.infos.get(recipe.id);
  if (info !== undefined && recipe.profession === pricing.profession) {
    parts.push({ info: info, perCraft: perCraft });
  }
  for (const reagent of recipe.reagents) {
    addParts(pricing, reagent[0], reagent[1] * perCraft, skill, path, parts);
  }
}

function addParts(pricing: Pricing, itemId: number, quantity: number, skill: number, path: number[], parts: Part[]): void {
  const price = priceAt(pricing, itemId, skill, path);
  if (price !== null && price.recipe !== null) {
    addRecipeParts(pricing, price.recipe, quantity, skill, path.concat([itemId]), parts);
  }
}

function ownCraftOf(pricing: Pricing, itemId: number, quantity: number, skill: number): OwnCraft | null {
  const recipe = cheapestRecipeFor(itemId);
  if (recipe === null || recipe.profession !== pricing.profession || !pricing.infos.has(recipe.id) || !canCraftAt(pricing, recipe, skill)) {
    return null;
  }
  const unitCost = craftedPrice(pricing, recipe, skill, [itemId]);
  if (unitCost === null) {
    return null;
  }
  const parts: Part[] = [];
  addRecipeParts(pricing, recipe, quantity, skill, [itemId], parts);
  return { unitCost: unitCost, parts: parts };
}

function candidateFor(pricing: Pricing, info: RecipeInfo, from: number): Candidate | null {
  if (isOnAnUnusedCooldown(pricing, info.recipe) || (!info.isKnown && info.learnCost === null)) {
    return null;
  }
  const skill = Math.max(info.levels[0], from);
  const inputs: CandidateInput[] = [];
  for (const reagent of info.recipe.reagents) {
    const price = priceAt(pricing, reagent[0], skill, []);
    if (price === null) {
      return null;
    }
    const parts: Part[] = [];
    addParts(pricing, reagent[0], reagent[1], skill, [], parts);
    let ownCraft: OwnCraft | null = null;
    if (price.recipe === null) {
      ownCraft = ownCraftOf(pricing, reagent[0], reagent[1], skill);
    }
    inputs.push({ itemId: reagent[0], quantity: reagent[1], unitCost: price.cost, parts: parts, ownCraft: ownCraft });
  }
  return { info: info, inputs: inputs };
}

function candidatesFor(pricing: Pricing, from: number): Candidate[] {
  const candidates: Candidate[] = [];
  pricing.infos.forEach(function addCandidate(info) {
    const candidate = candidateFor(pricing, info, from);
    if (candidate !== null) {
      candidates.push(candidate);
    }
  });
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

function isNew(info: RecipeInfo, learned: Set<number>): boolean {
  return !info.isKnown && !learned.has(info.recipe.id);
}

function pointsFrom(parts: Part[], skill: number): number {
  let points = 0;
  for (const part of parts) {
    points += part.perCraft * skillUpChance(part.info.levels, skill);
  }
  return points;
}

function craftForPointsWherePaysOff(bundle: Bundle, inputs: CandidateInput[], skill: number): void {
  for (const input of inputs) {
    if (input.ownCraft === null) {
      continue;
    }
    const cost = bundle.cost + (input.ownCraft.unitCost - input.unitCost) * input.quantity;
    const points = bundle.points + pointsFrom(input.ownCraft.parts, skill);
    if (cost / points < bundle.cost / bundle.points) {
      bundle.cost = cost;
      bundle.points = points;
      bundle.parts.push(...input.ownCraft.parts);
      bundle.craftedForPoints.push(input.itemId);
    }
  }
}

function bundleOf(candidate: Candidate, skill: number, made: Map<number, number>): Bundle {
  const chance = skillUpChance(candidate.info.levels, skill);
  const bundle: Bundle = { cost: 0, points: chance, fromStock: [], parts: [], craftedForPoints: [] };
  const bought: CandidateInput[] = [];
  for (const input of candidate.inputs) {
    if (chance > 0 && (made.get(input.itemId) || 0) >= input.quantity / chance) {
      bundle.fromStock.push(input);
      continue;
    }
    bought.push(input);
    bundle.cost += input.unitCost * input.quantity;
    bundle.points += pointsFrom(input.parts, skill);
    bundle.parts.push(...input.parts);
  }
  craftForPointsWherePaysOff(bundle, bought, skill);
  return bundle;
}

function newLessons(candidate: Candidate, bundle: Bundle, learned: Set<number>): RecipeInfo[] {
  const infos: RecipeInfo[] = [];
  if (isNew(candidate.info, learned)) {
    infos.push(candidate.info);
  }
  for (const part of bundle.parts) {
    if (isNew(part.info, learned) && infos.indexOf(part.info) === -1) {
      infos.push(part.info);
    }
  }
  return infos;
}

function costPerPoint(candidate: Candidate, skill: number, learned: Set<number>, obtained: number[], made: Map<number, number>): number | null {
  if (isNew(candidate.info, learned) && candidate.info.levels[0] > skill) {
    return null;
  }
  const tools = missingToolsCost(candidate.info.recipe, obtained);
  if (skillUpChance(candidate.info.levels, skill) <= 0 || tools === null) {
    return null;
  }
  const bundle = bundleOf(candidate, skill, made);
  let oneOff = tools;
  for (const info of newLessons(candidate, bundle, learned)) {
    oneOff += info.learnCost || 0;
  }
  return bundle.cost / bundle.points + oneOff / Math.max(1, candidate.info.levels[2] - skill);
}

function bestCandidate(candidates: Candidate[], skill: number, learned: Set<number>, obtained: number[], made: Map<number, number>, current: Candidate | null): Candidate | null {
  let best: Candidate | null = null;
  let bestCost = Infinity;
  for (const candidate of candidates) {
    const cost = costPerPoint(candidate, skill, learned, obtained, made);
    if (cost !== null && cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  if (current !== null && best !== current) {
    const currentCost = costPerPoint(current, skill, learned, obtained, made);
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

function guidePricing(pricing: Pricing, from: number): MaterialPricing {
  function unitCost(itemId: number): number {
    const price = priceAt(pricing, itemId, from, []);
    if (price === null) {
      return 0;
    }
    return price.cost;
  }
  function isCrafted(itemId: number): boolean {
    const price = priceAt(pricing, itemId, from, []);
    return price !== null && price.recipe !== null;
  }
  return { unitCost: unitCost, isCrafted: isCrafted };
}

function finishStep(step: GuideStep, expectedCrafts: number, expectedCost: number): GuideStep {
  step.crafts = Math.ceil(expectedCrafts - 0.0001);
  const materials = Math.round(expectedCost * step.crafts / expectedCrafts);
  step.unitCost = materials / step.crafts;
  step.cost = materials + (step.toolCost || 0);
  return step;
}

function lessonFor(info: RecipeInfo, skill: number): GuideLesson {
  return { recipeId: info.recipe.id, itemId: info.recipe.itemId, learnAt: Math.max(skill, info.levels[0]), teachingItemId: info.recipe.teachingItemId || null, cost: info.learnCost || 0 };
}

function toolRecipe(pricing: Pricing, categoryId: number): RecipeInfo | null {
  const itemId = toolCategory(categoryId).itemId;
  if (itemId === null || !isCheaperToCraft(itemId)) {
    return null;
  }
  let found: RecipeInfo | null = null;
  pricing.infos.forEach(function check(info) {
    if (info.recipe.itemId === itemId) {
      found = info;
    }
  });
  return found;
}

function compareByCost(first: GuideMaterial, second: GuideMaterial): number {
  return second.cost - first.cost;
}

function useBundle(candidate: Candidate, bundle: Bundle, made: Map<number, number>): void {
  const crafts = 1 / bundle.points;
  for (const input of bundle.fromStock) {
    made.set(input.itemId, (made.get(input.itemId) || 0) - input.quantity * crafts);
  }
  const itemId = candidate.info.recipe.itemId;
  if (itemId !== null) {
    made.set(itemId, (made.get(itemId) || 0) + candidate.info.recipe.quantity * crafts);
  }
}

export function buildGuide(profession: string, from: number, to: number, options: GuideOptions): Guide {
  clearMarketCache();
  const pricing: Pricing = { profession: profession, canCraft: options.canCraft, usesCooldowns: Boolean(options.usesCooldowns), infos: recipeInfos(profession, options.knownRecipeIds), cache: new Map() };
  const candidates = candidatesFor(pricing, from);
  const learned = new Set<number>();
  const obtained = options.ownedTools.slice();
  const made = new Map<number, number>();
  const guide: Guide = { profession: profession, from: from, to: to, steps: [], lessons: [], materials: [], total: 0, stuckAt: null, usesCooldowns: Boolean(options.usesCooldowns) };
  let step: GuideStep | null = null;
  let current: Candidate | null = null;
  let expectedCrafts = 0;
  let expectedCost = 0;
  for (let skill = from; skill < to; skill += 1) {
    const candidate = bestCandidate(candidates, skill, learned, obtained, made, current);
    current = candidate;
    if (candidate === null) {
      guide.stuckAt = skill;
      break;
    }
    const bundle = bundleOf(candidate, skill, made);
    for (const info of newLessons(candidate, bundle, learned)) {
      learned.add(info.recipe.id);
      guide.lessons.push(lessonFor(info, skill));
    }
    const recipe = candidate.info.recipe;
    const newTools = missingTools(recipe, obtained);
    if (step === null || startsNewStep(step, recipe.id, skill, bundle.craftedForPoints) || newTools.length > 0) {
      if (step !== null) {
        guide.steps.push(finishStep(step, expectedCrafts, expectedCost));
      }
      step = { recipeId: recipe.id, itemId: recipe.itemId, from: skill, to: skill, crafts: 0, unitCost: 0, cost: 0, color: recipeColor(candidate.info.levels, skill), reagents: recipe.reagents, makes: recipe.quantity, craftedForPoints: bundle.craftedForPoints };
      expectedCrafts = 0;
      expectedCost = 0;
    }
    if (newTools.length > 0) {
      step.tools = newTools;
      step.toolCost = missingToolsCost(recipe, obtained) || 0;
      for (const categoryId of newTools) {
        obtained.push(categoryId);
        const recipeForTool = toolRecipe(pricing, categoryId);
        if (recipeForTool !== null && isNew(recipeForTool, learned)) {
          learned.add(recipeForTool.recipe.id);
          guide.lessons.push(lessonFor(recipeForTool, skill));
        }
      }
    }
    expectedCrafts += 1 / bundle.points;
    expectedCost += bundle.cost / bundle.points;
    useBundle(candidate, bundle, made);
    step.colorTo = recipeColor(candidate.info.levels, skill);
    step.to = skill + 1;
  }
  if (step !== null) {
    guide.steps.push(finishStep(step, expectedCrafts, expectedCost));
  }
  for (const finished of guide.steps) {
    guide.total += finished.cost;
  }
  for (const lesson of guide.lessons) {
    guide.total += lesson.cost;
  }
  guide.materials = sumMaterials(guide.steps, guidePricing(pricing, from));
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

export function levelingCosts(profession: string, canCraft: CraftCheck, usesCooldowns: boolean): (number | null)[] {
  const guide = buildGuide(profession, 1, COMPARED_SKILLS[COMPARED_SKILLS.length - 1], { knownRecipeIds: [], canCraft: canCraft, ownedTools: [], usesCooldowns: usesCooldowns });
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

export function stepCraftCheck(profession: string, knownRecipeIds: number[], canCraft: CraftCheck, usesCooldowns: boolean): StepCraftCheck {
  const pricing: Pricing = { profession: profession, canCraft: canCraft, usesCooldowns: usesCooldowns, infos: recipeInfos(profession, knownRecipeIds), cache: new Map() };
  return function canCraftInStep(recipe: Recipe, step: GuideStep): boolean {
    return canCraftAt(pricing, recipe, step.from);
  };
}

function keepProducts(pool: StockPool, step: GuideStep, position: number): void {
  if (step.itemId === null || step.makes === undefined) {
    return;
  }
  const holdings = pool.get(step.itemId) || [];
  holdings.push({ character: MADE_EARLIER, place: String(position), count: step.crafts * step.makes });
  pool.set(step.itemId, holdings);
}

function planSteps(steps: GuideStep[], overrides: Record<string, PlanMode>[]): Plan[][] {
  const pool = createStockPool();
  return steps.map(function planned(step, position) {
    const plans = planEntries(stepEntries(step), pool, overrides[position]);
    keepProducts(pool, step, position);
    return plans;
  });
}

function buyInstead(planned: Plan[][], steps: GuideStep[], canCraft: StepCraftCheck, overrides: Record<string, PlanMode>[]): boolean {
  let hasChanged = false;
  planned.forEach(function check(plans, position) {
    for (const plan of plans) {
      for (const node of collectNodes(plan.root, [])) {
        if (node.recipe !== null && !canCraft(node.recipe, steps[position]) && !overrides[position][node.itemId] && buyOffer(node.itemId) !== null) {
          overrides[position][node.itemId] = "buy";
          hasChanged = true;
        }
      }
    }
  });
  return hasChanged;
}

export function planStepMaterials(steps: GuideStep[], canCraft: StepCraftCheck): Plan[][] {
  clearMarketCache();
  const overrides = steps.map(function craftedForPoints(step): Record<string, PlanMode> {
    const modes: Record<string, PlanMode> = {};
    for (const itemId of step.craftedForPoints || []) {
      modes[itemId] = "craft";
    }
    return modes;
  });
  let planned = planSteps(steps, overrides);
  for (let round = 0; round < MAX_RECIPE_DEPTH; round += 1) {
    if (!buyInstead(planned, steps, canCraft, overrides)) {
      break;
    }
    planned = planSteps(steps, overrides);
  }
  return planned;
}
