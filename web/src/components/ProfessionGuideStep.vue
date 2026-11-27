<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { craftingItem } from "../crafting-plan.ts";
import { stepName } from "../profession-guide.ts";
import type { GuideStep } from "../profession-guide.ts";
import type { Tooltip } from "../ui/upgrade-card.ts";
import ComparisonTooltip from "./ComparisonTooltip.vue";
import CraftingItemLabel from "./CraftingItemLabel.vue";
import MoneyAmount from "./MoneyAmount.vue";

const props = defineProps<{ step: GuideStep; done: boolean; craftFirst: string; keep: string; uses: string; recipe: Tooltip; tools: string }>();
const emit = defineEmits<{ toggle: [] }>();

const knownItemId = computed(function knownItem() {
  if (props.step.itemId === null || !window.FOREVER_CRAFTING_ITEMS[props.step.itemId]) {
    return null;
  }
  return props.step.itemId;
});

const name = computed(function craftedName() {
  return stepName(props.step.recipeId, props.step.itemId);
});

const rowClasses = computed(function stepClasses() {
  if (props.done) {
    return "guide-step panel guide-step-done";
  }
  return "guide-step panel";
});

const colorClasses = computed(function chipClasses() {
  return "tier-badge skill-chip tier-" + props.step.color;
});

const colorText = computed(function chipText() {
  if (props.step.colorTo === undefined || props.step.colorTo === props.step.color) {
    return props.step.color;
  }
  return props.step.color + " → " + props.step.colorTo;
});

const range = computed(function skillRange() {
  return props.step.from + " → " + props.step.to;
});

const crafts = computed(function craftCount() {
  return "Craft " + props.step.crafts + "×";
});

const reagents = computed(function reagentText() {
  return props.step.reagents.map(function reagentLine(reagent) {
    return reagent[1] * props.step.crafts + "× " + craftingItem(reagent[0]).name;
  }).join(", ");
});

function toggled(): void {
  emit("toggle");
}
</script>

<template>
  <li :class="rowClasses">
    <label class="guide-step-check"><input type="checkbox" :checked="done" @change="toggled"><span class="guide-step-range">{{ range }}</span></label>
    <div class="guide-step-body">
      <div class="guide-step-title">
        <span :class="colorClasses">{{ colorText }}</span>
        <span>{{ crafts }}</span>
        <span class="recipe-hover">
          <CraftingItemLabel v-if="knownItemId" :item-id="knownItemId" />
          <strong v-else tabindex="0">{{ name }}</strong>
          <ComparisonTooltip :tooltip="recipe" extra-class="tooltip-recipe" />
        </span>
        <span class="guide-step-cost"><MoneyAmount :copper="step.cost" /></span>
      </div>
      <p class="muted guide-step-reagents">{{ reagents }}</p>
      <p v-if="tools" class="muted guide-step-reagents">{{ tools }}</p>
      <p v-if="uses" class="muted guide-step-reagents">{{ uses }}</p>
      <p v-if="craftFirst" class="guide-step-craft-first">{{ craftFirst }}</p>
      <p v-if="keep" class="guide-step-craft-first">{{ keep }}</p>
    </div>
  </li>
</template>
