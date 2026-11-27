<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { completedQuests } from "../sources.ts";
import type { ChainStep } from "../questie.ts";
import type { Snapshot } from "../types.ts";
import { completedStepCount, isChainStepForCharacter } from "../ui/quest-steps.ts";
import QuestPlace from "./QuestPlace.vue";
import { WOWHEAD_URL } from "../prices.ts";
import { state } from "../state.ts";

const AVAILABLE_STEPS_SHOWN = 2;

const props = defineProps<{ questId: number; questName: string; snapshot: Snapshot }>();

const hasQuestie = computed(function questieConnected() {
  return state.questie !== null && Boolean((state.questie as { reader?: unknown }).reader);
});

const needsQuestie = computed(function questieMissing() {
  return !hasQuestie.value;
});

function isForCharacter(step: ChainStep): boolean {
  return isChainStepForCharacter(step, props.snapshot);
}

const steps = computed(function chainSteps(): ChainStep[] {
  if (!hasQuestie.value) {
    return [];
  }
  return window.QUESTIE.questChain(state.questie as Parameters<typeof window.QUESTIE.questChain>[0], props.questId).filter(isForCharacter);
});

const completed = computed(function completedIds() {
  return completedQuests(props.snapshot);
});

const available = computed(function availableSteps() {
  return window.QUESTIE.availableSteps(steps.value, completed.value);
});

const isChainDone = computed(function chainDone() {
  return hasQuestie.value && available.value.length === 0;
});

const progress = computed(function chainProgress() {
  if (steps.value.length <= 1) {
    return "";
  }
  return completedStepCount(steps.value, completed.value) + " of " + steps.value.length + " quests in this chain done";
});

function stepView(step: ChainStep) {
  return { step: step, url: WOWHEAD_URL + "quest=" + step.id, level: " (level " + step.questLevel + ")" };
}

const nextStep = computed(function firstAvailable() {
  if (available.value.length === 0) {
    return null;
  }
  return stepView(available.value[0]);
});

const title = computed(function questTitle() {
  if (nextStep.value !== null) {
    return { name: nextStep.value.step.name, url: nextStep.value.url, level: nextStep.value.level };
  }
  return { name: props.questName, url: WOWHEAD_URL + "quest=" + props.questId, level: "" };
});

const otherSteps = computed(function alsoAvailable() {
  return available.value.slice(1, AVAILABLE_STEPS_SHOWN).map(stepView);
});

const moreText = computed(function moreSteps() {
  if (available.value.length <= AVAILABLE_STEPS_SHOWN) {
    return "";
  }
  return "+" + (available.value.length - AVAILABLE_STEPS_SHOWN) + " more you can pick up now";
});
</script>

<template>
  <div class="quest-step">Quest: <a class="wowhead-link" :href="title.url" target="_blank" rel="noopener">{{ title.name }}</a><span class="muted">{{ title.level }}</span></div>
  <QuestPlace v-if="nextStep" :place="nextStep.step.starter" />
  <div v-if="needsQuestie" class="muted">Connect your WoW folder to see where it starts and the rest of its chain.</div>
  <div v-else-if="isChainDone" class="quest-done">Done: you completed the whole chain.</div>
  <template v-else>
    <div v-if="progress" class="muted">{{ progress }}</div>
    <template v-for="shown in otherSteps" :key="shown.step.id">
      <div class="quest-step">Also open: <a class="wowhead-link" :href="shown.url" target="_blank" rel="noopener">{{ shown.step.name }}</a>{{ shown.level }}</div>
      <QuestPlace :place="shown.step.starter" />
    </template>
    <div v-if="moreText" class="muted">{{ moreText }}</div>
  </template>
</template>
