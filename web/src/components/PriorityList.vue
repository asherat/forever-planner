<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import type { Character, PairedUpgradeOptions, Snapshot, UpgradeOptions } from "../types.ts";
import PriorityEntry from "./PriorityEntry.vue";
import { selectedCharacter, state } from "../state.ts";

const view = computed(function upgradeView(): { character: Character; snapshot: Snapshot; entries: { key: string; options: UpgradeOptions | PairedUpgradeOptions }[] } | null {
  const character = selectedCharacter();
  if (character === null || !state.snapshots[character.slug]) {
    return null;
  }
  const allOptions = (state.upgradeOptions || []) as (UpgradeOptions | PairedUpgradeOptions)[];
  return {
    character: character,
    snapshot: state.snapshots[character.slug],
    entries: allOptions.map(function entryOf(options) {
      return { key: options.slotDefinition.key, options: options };
    })
  };
});
</script>

<template>
  <template v-if="view">
    <PriorityEntry v-for="entry in view.entries" :key="entry.key" :options="entry.options" :character="view.character" :snapshot="view.snapshot" />
  </template>
</template>
