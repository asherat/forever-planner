<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import type { Character, Snapshot } from "../types.ts";
import { addQuestUpgrades, characterQuestList, clearQuestList, questUpgradesMissing } from "../ui/quest-list.ts";
import { renderTick } from "../ui/render-tick.ts";
import QuestEntry from "./QuestEntry.vue";
import { selectedCharacter, state } from "../state.ts";

const panel = computed(function currentCharacter(): { character: Character; snapshot: Snapshot } | null {
  renderTick.value;
  const character = selectedCharacter();
  if (character === null || !state.snapshots[character.slug]) {
    return null;
  }
  return { character: character, snapshot: state.snapshots[character.slug] };
});

const entries = computed(function questEntries() {
  if (panel.value === null) {
    return [];
  }
  return characterQuestList(panel.value.character).slice();
});

const isEmpty = computed(function listEmpty() {
  return entries.value.length === 0;
});

const hasEntries = computed(function listHasEntries() {
  return entries.value.length > 0;
});

const missingCount = computed(function missingUpgrades() {
  if (panel.value === null) {
    return 0;
  }
  return questUpgradesMissing(panel.value.character).length;
});

const addLabel = computed(function addButtonLabel() {
  return "Add quest upgrades (" + missingCount.value + ")";
});
</script>

<template>
  <p v-if="isEmpty" class="muted">Empty. Use "Add quest" on an upgrade that comes from a quest, or add them all at once below. The list shows the next step of each chain.</p>
  <ol v-if="panel" class="quest-list-items">
    <QuestEntry v-for="entry in entries" :key="entry.questId" :entry="entry" :character="panel.character" :snapshot="panel.snapshot" />
  </ol>
  <button v-if="missingCount" type="button" @click="addQuestUpgrades">{{ addLabel }}</button>
  <div v-if="hasEntries" class="inline-fields">
    <button type="button" @click="clearQuestList">Clear list</button>
  </div>
</template>
