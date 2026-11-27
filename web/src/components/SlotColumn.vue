<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import type { Character, SlotDefinition, Snapshot, UpgradeOptions } from "../types.ts";
import { renderTick } from "../ui/render-tick.ts";
import PaperDollSlot from "./PaperDollSlot.vue";

const props = defineProps<{ column: string }>();

function slotOptions(slotDefinition: SlotDefinition): UpgradeOptions | null {
  const upgradesBySlot = (state.upgradesBySlot || {}) as Record<string, UpgradeOptions>;
  return upgradesBySlot[slotDefinition.key] || null;
}

const view = computed(function columnView(): { character: Character; snapshot: Snapshot; slots: { slotDefinition: SlotDefinition; options: UpgradeOptions | null }[] } | null {
  renderTick.value;
  const character = selectedCharacter();
  if (character === null || !state.snapshots[character.slug]) {
    return null;
  }
  const slots: { slotDefinition: SlotDefinition; options: UpgradeOptions | null }[] = [];
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    if (slotDefinition.column === props.column) {
      slots.push({ slotDefinition: slotDefinition, options: slotOptions(slotDefinition) });
    }
  }
  return { character: character, snapshot: state.snapshots[character.slug], slots: slots };
});
</script>

<template>
  <template v-if="view">
    <PaperDollSlot v-for="slot in view.slots" :key="slot.slotDefinition.key" :slot-definition="slot.slotDefinition" :snapshot="view.snapshot" :character="view.character" :options="slot.options" />
  </template>
</template>
