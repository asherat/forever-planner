<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { craftingItem } from "../crafting-plan.ts";
import { stepName } from "../profession-guide.ts";
import type { GuideStep } from "../profession-guide.ts";
import CraftingItemLabel from "./CraftingItemLabel.vue";
import MoneyAmount from "./MoneyAmount.vue";

const props = defineProps<{ step: GuideStep; done: boolean; craftFirst: string }>();
const emit = defineEmits<{ toggle: [] }>();

const isKnownItem = computed(function knownItem() {
  return Boolean(window.FOREVER_CRAFTING_ITEMS[props.step.itemId]);
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
        <span :class="colorClasses">{{ step.color }}</span>
        <span>{{ crafts }}</span>
        <CraftingItemLabel v-if="isKnownItem" :item-id="step.itemId" />
        <strong v-else>{{ name }}</strong>
        <span class="guide-step-cost"><MoneyAmount :copper="step.cost" /></span>
      </div>
      <p class="muted guide-step-reagents">{{ reagents }}</p>
      <p v-if="craftFirst" class="guide-step-craft-first">{{ craftFirst }}</p>
    </div>
  </li>
</template>
