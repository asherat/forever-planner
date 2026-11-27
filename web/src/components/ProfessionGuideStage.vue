<script setup lang="ts">
import type { StageRow } from "../ui/profession-page.ts";
import CraftingItemLabel from "./CraftingItemLabel.vue";
import MoneyAmount from "./MoneyAmount.vue";
import ProfessionGuideStep from "./ProfessionGuideStep.vue";

defineProps<{ stage: StageRow }>();
const emit = defineEmits<{ toggleStep: [index: number]; toggleBought: [key: string]; toggleAll: [] }>();

function stepToggled(index: number): void {
  emit("toggleStep", index);
}

function materialToggled(key: string): void {
  emit("toggleBought", key);
}

function allToggled(): void {
  emit("toggleAll");
}
</script>

<template>
  <section class="guide-stage">
    <header class="guide-stage-header">
      <h2>{{ stage.title }}</h2>
      <span class="guide-stage-cost">{{ "Cost " }}<MoneyAmount :copper="stage.cost" /><span class="muted">{{ " · running total " }}<MoneyAmount :copper="stage.runningTotal" /></span></span>
    </header>
    <p v-if="stage.training" class="guide-stage-training">{{ stage.training }}</p>
    <div v-if="stage.hasLessons || stage.hasMaterials" class="guide-stage-prep">
      <section v-if="stage.hasMaterials" class="panel">
        <div class="guide-stage-prep-heading">
          <h3>Buy</h3>
          <button type="button" class="link" @click="allToggled">{{ stage.tickAllLabel }}</button>
        </div>
        <ul class="summary-list">
          <li v-for="row in stage.materials" :key="row.key" class="guide-material">
            <input :id="row.inputId" type="checkbox" :checked="row.bought" @change="materialToggled(row.key)">
            <label :for="row.inputId" class="guide-material-name">{{ row.quantity }} <CraftingItemLabel :item-id="row.itemId" /><span v-if="row.how" class="muted guide-material-how">{{ row.how }}</span></label>
            <span class="summary-value"><MoneyAmount :copper="row.cost" /></span>
          </li>
        </ul>
      </section>
      <section v-if="stage.hasLessons" class="panel">
        <h3>Learn</h3>
        <ul class="summary-list">
          <li v-for="lesson in stage.lessons" :key="lesson.key" class="summary-row">
            <strong>{{ lesson.name }}</strong>
            <span class="summary-value muted">{{ lesson.where }}<template v-if="lesson.hasCost">{{ ", about " }}<MoneyAmount :copper="lesson.cost" /></template></span>
            <template v-if="lesson.source">
              <span v-if="lesson.source.text" class="summary-value muted">{{ lesson.source.text }}</span>
              <span v-for="line in lesson.source.lines" :key="line.key" :class="line.classes" v-bind="line.mapAttributes">{{ line.prefix }}<a v-if="line.npcUrl" :href="line.npcUrl" target="_blank" rel="noopener">{{ line.npcName }}</a>{{ line.suffix }}{{ line.coordinates }}</span>
            </template>
          </li>
        </ul>
      </section>
    </div>
    <ol class="crafting-list guide-steps">
      <ProfessionGuideStep v-for="row in stage.steps" :key="row.key" :step="row.step" :done="row.done" @toggle="stepToggled(row.index)" />
    </ol>
  </section>
</template>
