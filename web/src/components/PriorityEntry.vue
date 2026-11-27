<script setup lang="ts">
import { computed } from "vue";
import type { Character, PairedUpgradeOptions, Snapshot, UpgradeOptions } from "../types.ts";
import UpgradeCard from "./UpgradeCard.vue";
import WowheadLink from "./WowheadLink.vue";

const props = defineProps<{ options: UpgradeOptions | PairedUpgradeOptions; character: Character; snapshot: Snapshot }>();

function isGroup(options: UpgradeOptions | PairedUpgradeOptions): options is PairedUpgradeOptions {
  return "group" in options;
}

function partView(part: UpgradeOptions) {
  const equipped = props.snapshot.equipment[part.slotDefinition.key];
  return {
    options: part,
    anchor: "upgrade-" + part.slotDefinition.key,
    equipped: equipped || null,
    emptyText: "Fill your empty " + part.slotDefinition.label.toLowerCase() + " slot"
  };
}

const group = computed(function groupView() {
  if (!isGroup(props.options)) {
    return null;
  }
  return { label: props.options.slotDefinition.groupLabel, parts: props.options.parts.map(partView) };
});

const single = computed(function singleView() {
  if (isGroup(props.options)) {
    return null;
  }
  return partView(props.options);
});
</script>

<template>
  <li v-if="group" class="priority">
    <h3 class="priority-heading">{{ group.label }}</h3>
    <div v-for="part in group.parts" :id="part.anchor" :key="part.anchor" class="priority-part">
      <h4 class="priority-part-heading">
        <template v-if="part.equipped">Replace <WowheadLink :item="part.equipped" /></template>
        <template v-else>{{ part.emptyText }}</template>
      </h4>
      <div class="option-row">
        <UpgradeCard label="Best upgrade" :candidate="part.options.best" :character="character" :snapshot="snapshot" :slot-definition="part.options.slotDefinition" />
        <UpgradeCard v-if="part.options.quicker" label="Quicker option" :candidate="part.options.quicker" :character="character" :snapshot="snapshot" :slot-definition="part.options.slotDefinition" />
      </div>
    </div>
  </li>
  <li v-else-if="single" :id="single.anchor" class="priority">
    <h3 class="priority-heading">
      <span>{{ single.options.slotDefinition.label }}</span>
      <span v-if="single.equipped" class="priority-current muted">now <WowheadLink :item="single.equipped" /></span>
    </h3>
    <div class="option-row">
      <UpgradeCard label="Best upgrade" :candidate="single.options.best" :character="character" :snapshot="snapshot" :slot-definition="single.options.slotDefinition" />
      <UpgradeCard v-if="single.options.quicker" label="Quicker option" :candidate="single.options.quicker" :character="character" :snapshot="snapshot" :slot-definition="single.options.slotDefinition" />
    </div>
  </li>
</template>
