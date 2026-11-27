<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { dataStatusText } from "../ui/folder-controls.ts";
import { selectedCharacter, state } from "../state.ts";
import { MAX_SKILL, characterSkill, chooseCharacter, chooseProfession, compareProfessions, comparisonRows, costStillToBuy, discardGuide, guideForm, guideSummary, hasProfessionsToCompare, makeGuide, professionChoices, savedGuide, shoppingRows, skillLine, stageRows, toggleBought, toggleStageBought, toggleStep } from "../ui/profession-page.ts";
import type { StageRow } from "../ui/profession-page.ts";
import CraftingItemLabel from "./CraftingItemLabel.vue";
import MoneyAmount from "./MoneyAmount.vue";
import ProfessionComparison from "./ProfessionComparison.vue";
import ProfessionGuideStage from "./ProfessionGuideStage.vue";
import ShoppingCopyButtons from "./ShoppingCopyButtons.vue";

const status = computed(function dataStatus() {
  return { text: dataStatusText(), isConnected: state.wowFolderConnected };
});

const characters = computed(function characterChoices() {
  return state.settings.characters.map(function optionOf(character) {
    return { slug: character.slug, name: character.displayName };
  });
});

const selectedSlug = computed(function selectedSlugView() {
  return state.settings.selectedCharacterSlug || "";
});

const professions = computed(function professionOptions() {
  return professionChoices(selectedCharacter());
});

const skill = computed(function currentSkill() {
  return characterSkill(selectedCharacter(), guideForm.profession);
});

const skillText = computed(function skillTextView() {
  return skillLine(guideForm.profession, skill.value);
});

const saved = computed(function savedPlan() {
  return savedGuide(selectedCharacter(), guideForm.profession);
});

const canCompare = computed(function severalToCompare() {
  return hasProfessionsToCompare(selectedCharacter());
});

const hasNoPrices = computed(function pricesMissing() {
  return state.tsm === null;
});

const makeLabel = computed(function makeButtonLabel() {
  if (saved.value !== null) {
    return "Make a new plan";
  }
  return "Make a plan";
});

const comparedRows = computed(function comparedRowsView() {
  return comparisonRows(selectedCharacter());
});

const hasComparison = computed(function anyComparison() {
  return comparedRows.value.length > 0;
});

const stages = computed(function stagesView() {
  if (saved.value === null) {
    return [];
  }
  return stageRows(saved.value, skill.value, selectedCharacter());
});

const summary = computed(function summaryView() {
  if (saved.value === null) {
    return null;
  }
  return guideSummary(saved.value, stages.value);
});

const shopping = computed(function shoppingView() {
  return shoppingRows(stages.value);
});

const shoppingExport = computed(function linesToCopy() {
  return shopping.value.map(function lineOf(row) {
    return { itemId: row.itemId, quantity: row.count, fromVendor: row.fromVendor };
  });
});

const shoppingLabel = computed(function shoppingSummary() {
  return "Everything still to buy (" + shopping.value.length + ")";
});

const hasShopping = computed(function anyShopping() {
  return shopping.value.length > 0;
});

const materialsCost = computed(function costLeft() {
  return costStillToBuy(stages.value);
});

function characterChosen(event: Event): void {
  chooseCharacter((event.target as HTMLSelectElement).value);
}

function professionChosen(event: Event): void {
  chooseProfession((event.target as HTMLSelectElement).value);
}

function stepToggled(index: number): void {
  if (saved.value !== null) {
    toggleStep(saved.value, index);
  }
}

function materialToggled(key: string): void {
  if (saved.value !== null) {
    toggleBought(saved.value, key);
  }
}

function stageToggled(stage: StageRow): void {
  if (saved.value !== null) {
    toggleStageBought(saved.value, stage);
  }
}

function comparedChosen(profession: string): void {
  chooseProfession(profession);
}

function discard(): void {
  discardGuide(guideForm.profession);
}
</script>

<template>
  <header class="page-heading">
    <h1>Professions</h1>
    <p class="muted">The cheapest way to level a profession at today's prices.</p>
    <details class="page-help">
      <summary>How the plan works</summary>
      <p class="muted">Orange recipes always give a skill point; yellow and green ones give one less often, so the plan counts the extra crafts. Crafting a recipe's own components gives skill too. Each trainer rank has its own recipes to learn and materials to buy.</p>
    </details>
    <p class="muted page-data-status">{{ status.text }}</p>
  </header>

  <section class="panel guide-form">
    <label>Character
      <select :value="selectedSlug" @change="characterChosen">
        <option v-for="character in characters" :key="character.slug" :value="character.slug">{{ character.name }}</option>
      </select>
    </label>
    <label>Profession
      <select :value="guideForm.profession" @change="professionChosen">
        <option v-for="profession in professions" :key="profession.name" :value="profession.name">{{ profession.label }}</option>
      </select>
    </label>
    <label>From skill <input v-model.number="guideForm.from" type="number" min="1" :max="MAX_SKILL - 1"></label>
    <label>To skill <input v-model.number="guideForm.to" type="number" min="2" :max="MAX_SKILL"></label>
    <label class="checkbox-line guide-form-option"><input v-model="guideForm.usesCooldowns" type="checkbox"> Craft recipes with a cooldown myself (transmutes, Mooncloth) instead of buying what they make</label>
    <button type="button" class="primary" :disabled="hasNoPrices" @click="makeGuide">{{ makeLabel }}</button>
    <button v-if="canCompare" type="button" :disabled="hasNoPrices" @click="compareProfessions">Compare professions</button>
    <p class="muted guide-form-note">{{ skillText }}</p>
  </section>

  <ProfessionComparison v-if="hasComparison" :rows="comparedRows" @choose="comparedChosen" />

  <section v-if="summary" class="crafting-layout">
    <div class="crafting-list-column">
      <h2>{{ summary.title }}</h2>
      <p class="muted">{{ summary.made }} · {{ summary.progress }}</p>
      <p v-if="summary.stuck" class="verdict-bad">{{ summary.stuck }}</p>
      <ProfessionGuideStage v-for="stage in stages" :key="stage.key" :stage="stage" @toggle-step="stepToggled" @toggle-bought="materialToggled" @toggle-all="stageToggled(stage)" />
      <div><button type="button" class="link" @click="discard">Remove this plan</button></div>
    </div>
    <aside class="crafting-summary">
      <section class="panel">
        <h2>Total</h2>
        <div>{{ "Whole plan: " }}<MoneyAmount :copper="summary.total" /></div>
        <div>{{ "Still to buy: " }}<MoneyAmount :copper="materialsCost" /></div>
      </section>
      <details v-if="hasShopping" class="panel summary-details">
        <summary>{{ shoppingLabel }}</summary>
        <ul class="summary-list">
          <li v-for="row in shopping" :key="row.key" class="guide-shopping">
            <span class="guide-material-name">{{ row.quantity }} <CraftingItemLabel :item-id="row.itemId" /></span>
            <span v-if="row.hasPrice" class="summary-value"><MoneyAmount :copper="row.cost" /></span>
            <span v-else class="summary-value muted">no price</span>
          </li>
        </ul>
        <ShoppingCopyButtons :list-name="summary.title" :lines="shoppingExport" />
      </details>
    </aside>
  </section>
</template>
