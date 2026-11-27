<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { connectFolder, dataStatusText } from "../ui/folder-controls.ts";
import { saveSettings, selectedCharacter, state } from "../state.ts";
import { MAX_SKILL, characterSkill, chooseProfession, costStillToBuy, discardGuide, guideForm, guideSummary, makeGuide, professionChoices, savedGuide, shoppingRows, skillLine, stageRows, startGuidePage, toggleBought, toggleStageBought, toggleStep } from "../ui/profession-page.ts";
import type { StageRow } from "../ui/profession-page.ts";
import CraftingItemLabel from "./CraftingItemLabel.vue";
import MoneyAmount from "./MoneyAmount.vue";
import ProfessionGuideStage from "./ProfessionGuideStage.vue";

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

const hasNoPrices = computed(function pricesMissing() {
  return state.tsm === null;
});

const makeLabel = computed(function makeButtonLabel() {
  if (saved.value !== null) {
    return "Make a new plan";
  }
  return "Make a plan";
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

const hasShopping = computed(function anyShopping() {
  return shopping.value.length > 0;
});

const materialsCost = computed(function costLeft() {
  return costStillToBuy(stages.value);
});

function characterChosen(event: Event): void {
  state.settings.selectedCharacterSlug = (event.target as HTMLSelectElement).value;
  saveSettings();
  startGuidePage();
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

function discard(): void {
  discardGuide(guideForm.profession);
}
</script>

<template>
  <section class="panel crafting-intro">
    <h1>Professions</h1>
    <p class="muted">The cheapest way to level a profession with today's auction house and vendor prices. Orange recipes always give a point; yellow and green ones give one less often, so the plan counts the extra crafts. The plan is split by trainer rank, each with its own recipes to learn and materials to buy.</p>
    <p class="muted">{{ status.text }}</p>
    <div class="inline-fields">
      <button type="button" :hidden="status.isConnected" @click="connectFolder">Connect WoW folder</button>
    </div>
  </section>

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
    <button type="button" class="primary" :disabled="hasNoPrices" @click="makeGuide">{{ makeLabel }}</button>
    <p class="muted guide-form-note">{{ skillText }}</p>
  </section>

  <section v-if="summary" class="crafting-layout">
    <div class="crafting-list-column">
      <h2>{{ summary.title }}</h2>
      <p class="muted">{{ summary.made }} {{ summary.progress }}.</p>
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
      <section v-if="hasShopping" class="panel">
        <h2>Still to buy</h2>
        <p class="muted summary-value">Everything not ticked in the stages, after what your characters already have, at today's prices.</p>
        <ul class="summary-list">
          <li v-for="row in shopping" :key="row.key" class="guide-shopping">
            <span class="guide-material-name">{{ row.quantity }} <CraftingItemLabel :item-id="row.itemId" /></span>
            <span v-if="row.hasPrice" class="summary-value"><MoneyAmount :copper="row.cost" /></span>
            <span v-else class="summary-value muted">no price</span>
          </li>
        </ul>
      </section>
    </aside>
  </section>
</template>
