<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { itemById, completedQuests } from "../sources.ts";
import type { ChainStep } from "../questie.ts";
import type { Character, Snapshot } from "../types.ts";
import { completedStepCount, isChainStepForCharacter, offPathZone, removeFromQuestList, savedQuestName } from "../ui/quest-list.ts";
import type { QuestListEntry } from "../ui/quest-list.ts";
import ItemIcon from "./ItemIcon.vue";
import QuestPlace from "./QuestPlace.vue";
import WowheadLink from "./WowheadLink.vue";
import { WOWHEAD_URL } from "../prices.ts";
import { state } from "../state.ts";

const AVAILABLE_STEPS_SHOWN = 2;

const props = defineProps<{ entry: QuestListEntry; character: Character; snapshot: Snapshot }>();

const item = computed(function rewardItem() {
  return itemById(props.entry.itemId);
});

const offPath = computed(function offPathZoneName() {
  return offPathZone(props.entry, props.character, props.snapshot);
});

const offPathText = computed(function offPathNotice() {
  return offPath.value + " is no longer on your leveling path. ";
});

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
  return window.QUESTIE.questChain(state.questie as Parameters<typeof window.QUESTIE.questChain>[0], props.entry.questId).filter(isForCharacter);
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
  return {
    step: step,
    url: WOWHEAD_URL + "quest=" + step.id,
    level: " (level " + step.questLevel + ")"
  };
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
  return { name: savedQuestName(props.entry), url: WOWHEAD_URL + "quest=" + props.entry.questId, level: "" };
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

function remove(): void {
  removeFromQuestList(props.entry.questId);
}
</script>

<template>
  <li class="quest-entry">
    <div class="quest-entry-header">
      <span class="quest-title"><a class="wowhead-link" :href="title.url" target="_blank" rel="noopener">{{ title.name }}</a><span class="muted">{{ title.level }}</span></span>
      <button type="button" class="cart-remove" aria-label="Remove from quest list" @click="remove">×</button>
    </div>
    <QuestPlace v-if="nextStep" :place="nextStep.step.starter" />
    <div v-if="offPath" class="quest-off-path">
      {{ offPathText }}<button type="button" class="link" @click="remove">Remove it</button>
    </div>
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
    <div v-if="item" class="quest-reward">Reward: <ItemIcon :item="item" size="icon-small" /><WowheadLink :item="item" /></div>
  </li>
</template>
