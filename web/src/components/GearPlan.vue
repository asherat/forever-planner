<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { selectedCharacter, state } from "../state.ts";
import { craftAllHref, craftedPlanItemIds, planGroups } from "../ui/gear-plan.ts";
import PlanEntry from "./PlanEntry.vue";

const view = computed(function planView() {
  const character = selectedCharacter();
  if (character === null || !state.snapshots[character.slug]) {
    return null;
  }
  const snapshot = state.snapshots[character.slug];
  const groups = planGroups(character, snapshot);
  const craftAll = craftAllHref(craftedPlanItemIds(character, snapshot));
  return {
    snapshot: snapshot,
    isEmpty: groups.length === 0,
    groups: groups.map(function withCraftLink(group) {
      return { key: group.key, title: group.title, entries: group.entries, showsCraftAll: group.key === "craft", craftAll: craftAll };
    })
  };
});
</script>

<template>
  <template v-if="view">
    <p v-if="view.isEmpty" class="muted">Click the upgrades you want on the left. They show up here, grouped by where to get them along your leveling path.</p>
    <section v-for="group in view.groups" :key="group.key" class="plan-group">
      <h3 class="plan-group-title">{{ group.title }}</h3>
      <ol class="plan-entries">
        <PlanEntry v-for="entry in group.entries" :key="entry.slotKey" :entry="entry" :snapshot="view.snapshot" />
      </ol>
      <a v-if="group.showsCraftAll" class="button-link primary" :href="group.craftAll">Craft all</a>
    </section>
  </template>
</template>
