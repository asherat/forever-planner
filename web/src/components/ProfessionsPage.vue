<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { connectCraftingFolder, dataStatusText, recipeSource } from "../ui/crafting-page.ts";
import { stepName } from "../profession-guide.ts";
import { saveSettings, selectedCharacter, state } from "../state.ts";
import { MAX_SKILL, PROFESSIONS, characterProfessions, characterSkill, chooseProfession, discardGuide, guideForm, isStepDone, makeGuide, materialsLeft, recipeById, savedGuide, startGuidePage, toggleBought, toggleStep } from "../ui/profession-page.ts";
import CraftingItemLabel from "./CraftingItemLabel.vue";
import MoneyAmount from "./MoneyAmount.vue";
import ProfessionGuideStep from "./ProfessionGuideStep.vue";

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

const professions = computed(function professionChoices() {
  const own = characterProfessions(selectedCharacter());
  const others = PROFESSIONS.filter(function isNotOwn(name) {
    return own.indexOf(name) === -1;
  });
  return own.map(function ownOption(name) {
    return { name: name, label: name + " (yours)" };
  }).concat(others.map(function otherOption(name) {
    return { name: name, label: name };
  }));
});

const skill = computed(function currentSkill() {
  return characterSkill(selectedCharacter(), guideForm.profession);
});

const skillText = computed(function skillLine() {
  if (skill.value === null) {
    return "";
  }
  return "Your " + guideForm.profession + " skill on Battle.net: " + skill.value + ". Steps up to it are ticked by themselves after a Refresh.";
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

const steps = computed(function stepRows() {
  if (saved.value === null) {
    return [];
  }
  const plan = saved.value;
  return plan.guide.steps.map(function rowOf(step, index) {
    return { key: index + ":" + step.recipeId, index: index, step: step, done: isStepDone(plan, step, index, skill.value) };
  });
});

const summary = computed(function planSummary() {
  if (saved.value === null) {
    return null;
  }
  const guide = saved.value.guide;
  let stuck = "";
  if (guide.stuckAt !== null) {
    stuck = "No recipe with known prices gives skill at " + guide.stuckAt + ". Connect your WoW folder for more prices, or check the auction house for patterns.";
  }
  const done = steps.value.filter(function isDone(row) {
    return row.done;
  }).length;
  return {
    title: guide.profession + " " + guide.from + " → " + guide.to,
    made: "Planned on " + new Date(saved.value.createdAt).toLocaleString() + " with that day's prices. Make a new plan to use today's.",
    progress: done + " of " + guide.steps.length + " steps done",
    total: guide.total,
    stuck: stuck
  };
});

const lessons = computed(function lessonRows() {
  if (saved.value === null) {
    return [];
  }
  return saved.value.guide.lessons.map(function rowOf(lesson) {
    const recipe = recipeById(lesson.recipeId);
    let source = null;
    if (recipe !== null && recipe.teachingItemId) {
      source = recipeSource(recipe);
    }
    let where = "At a trainer, at skill " + lesson.learnAt;
    if (lesson.teachingItemId !== null) {
      where = "Pattern, usable at skill " + lesson.learnAt;
    }
    return { key: lesson.recipeId, name: stepName(lesson.recipeId, lesson.itemId), where: where, cost: lesson.cost, hasCost: lesson.cost > 0, source: source };
  });
});

const hasLessons = computed(function anyLessons() {
  return lessons.value.length > 0;
});

const materials = computed(function materialRows() {
  if (saved.value === null) {
    return [];
  }
  const plan = saved.value;
  return materialsLeft(plan, skill.value).map(function rowOf(material) {
    let label = "";
    if (material.craft) {
      label = "Cheaper to craft";
    }
    return { key: material.itemId, itemId: material.itemId, quantity: material.quantity + "×", cost: material.cost, bought: plan.boughtItemIds.indexOf(material.itemId) !== -1, how: label, inputId: "material-" + material.itemId };
  });
});

const hasMaterials = computed(function anyMaterials() {
  return materials.value.length > 0;
});

const materialsCost = computed(function costLeft() {
  return materials.value.filter(function notBought(row) {
    return !row.bought;
  }).reduce(function addCost(total, row) {
    return total + row.cost;
  }, 0);
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

function materialToggled(itemId: number): void {
  if (saved.value !== null) {
    toggleBought(saved.value, itemId);
  }
}

function discard(): void {
  discardGuide(guideForm.profession);
}
</script>

<template>
  <section class="panel crafting-intro">
    <h1>Professions</h1>
    <p class="muted">The cheapest way to level a profession with today's auction house and vendor prices. Orange recipes always give a point; yellow and green ones give one less often, so the plan counts the extra crafts. Train the next rank at your trainer at 50, 125 and 200.</p>
    <p class="muted">{{ status.text }}</p>
    <div class="inline-fields">
      <button type="button" :hidden="status.isConnected" @click="connectCraftingFolder">Connect WoW folder</button>
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
      <ol class="crafting-list guide-steps">
        <ProfessionGuideStep v-for="row in steps" :key="row.key" :step="row.step" :done="row.done" @toggle="stepToggled(row.index)" />
      </ol>
      <div><button type="button" class="link" @click="discard">Remove this plan</button></div>
    </div>
    <aside class="crafting-summary">
      <section class="panel">
        <h2>Total</h2>
        <div>{{ "Whole plan: " }}<MoneyAmount :copper="summary.total" /></div>
        <div>{{ "Still to buy: " }}<MoneyAmount :copper="materialsCost" /></div>
      </section>
      <section v-if="hasMaterials" class="panel">
        <h2>Materials for the steps left</h2>
        <p class="muted summary-value">Tick what you've bought or made.</p>
        <ul class="summary-list">
          <li v-for="row in materials" :key="row.key" class="guide-material">
            <input :id="row.inputId" type="checkbox" :checked="row.bought" @change="materialToggled(row.itemId)">
            <label :for="row.inputId" class="guide-material-name">{{ row.quantity }} <CraftingItemLabel :item-id="row.itemId" /><span v-if="row.how" class="muted guide-material-how">{{ row.how }}</span></label>
            <span class="summary-value"><MoneyAmount :copper="row.cost" /></span>
          </li>
        </ul>
      </section>
      <section v-if="hasLessons" class="panel">
        <h2>Recipes to learn</h2>
        <ul class="summary-list">
          <li v-for="lesson in lessons" :key="lesson.key" class="summary-row">
            <strong>{{ lesson.name }}</strong>
            <span class="summary-value muted">{{ lesson.where }}<template v-if="lesson.hasCost">{{ ", about " }}<MoneyAmount :copper="lesson.cost" /></template></span>
            <template v-if="lesson.source">
              <span v-if="lesson.source.text" class="summary-value muted">{{ lesson.source.text }}</span>
              <span v-for="line in lesson.source.lines" :key="line.key" :class="line.classes" v-bind="line.mapAttributes">{{ line.prefix }}<a v-if="line.npcUrl" :href="line.npcUrl" target="_blank" rel="noopener">{{ line.npcName }}</a>{{ line.suffix }}{{ line.coordinates }}</span>
            </template>
          </li>
        </ul>
      </section>
    </aside>
  </section>
</template>
