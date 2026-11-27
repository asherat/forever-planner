import { reactive } from "vue";
import "../legacy.ts";
import { buildGuide, professionRecipes } from "../profession-guide.ts";
import type { GuideMaterial, GuideStep } from "../profession-guide.ts";
import type { Recipe } from "../crafting-plan.ts";
import { saveSettings, selectedCharacter, state } from "../state.ts";
import type { Character, SavedGuide } from "../types.ts";

export const PROFESSIONS = ["Alchemy", "Blacksmithing", "Cooking", "Enchanting", "Engineering", "First Aid", "Leatherworking", "Tailoring"];
export const MAX_SKILL = 300;

export const guideForm = reactive({ profession: "", from: 1, to: MAX_SKILL });

export function characterSkill(character: Character | null, profession: string): number | null {
  if (character === null || !state.snapshots[character.slug]) {
    return null;
  }
  for (const entry of state.snapshots[character.slug].professions) {
    if (entry.name === profession && entry.skillPoints !== undefined) {
      return entry.skillPoints;
    }
  }
  return null;
}

export function knownRecipeIds(character: Character | null, profession: string): number[] {
  if (character === null || !state.snapshots[character.slug]) {
    return [];
  }
  for (const entry of state.snapshots[character.slug].professions) {
    if (entry.name === profession) {
      return entry.recipeIds || [];
    }
  }
  return [];
}

export function characterProfessions(character: Character | null): string[] {
  if (character === null || !state.snapshots[character.slug]) {
    return [];
  }
  return state.snapshots[character.slug].professions.map(function nameOf(entry) {
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

export function materialsLeft(saved: SavedGuide, skill: number | null): GuideMaterial[] {
  const materials = new Map<number, GuideMaterial>();
  saved.guide.steps.forEach(function addStep(step, index) {
    if (isStepDone(saved, step, index, skill)) {
      return;
    }
    for (const reagent of step.reagents) {
      const material = materials.get(reagent[0]) || { itemId: reagent[0], quantity: 0, cost: 0, craft: craftsMaterial(saved, reagent[0]) };
      const quantity = reagent[1] * step.crafts;
      material.cost += quantity * unitPrice(saved, reagent[0]);
      material.quantity += quantity;
      materials.set(reagent[0], material);
    }
  });
  return Array.from(materials.values()).sort(function byCost(first, second) {
    return second.cost - first.cost;
  });
}

function craftsMaterial(saved: SavedGuide, itemId: number): boolean {
  for (const material of saved.guide.materials) {
    if (material.itemId === itemId) {
      return Boolean(material.craft);
    }
  }
  return false;
}

function unitPrice(saved: SavedGuide, itemId: number): number {
  for (const material of saved.guide.materials) {
    if (material.itemId === itemId && material.quantity > 0) {
      return material.cost / material.quantity;
    }
  }
  return 0;
}

export function recipeById(recipeId: number): Recipe | null {
  for (const recipe of professionRecipes(guideForm.profession)) {
    if (recipe.id === recipeId) {
      return recipe;
    }
  }
  return null;
}
