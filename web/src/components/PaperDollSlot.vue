<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import type { Character, SlotDefinition, Snapshot, UpgradeOptions } from "../types.ts";
import { comparisonTooltip, itemTooltip } from "../ui/upgrade-card.ts";
import ComparisonTooltip from "./ComparisonTooltip.vue";
import ItemIcon from "./ItemIcon.vue";
import { wowheadUrl } from "../prices.ts";

const props = defineProps<{ slotDefinition: SlotDefinition; snapshot: Snapshot; character: Character; options: UpgradeOptions | null }>();

const slotClasses = computed(function slotClass() {
  return "slot slot-" + props.slotDefinition.column;
});

const equipped = computed(function equippedView() {
  const item = props.snapshot.equipment[props.slotDefinition.key];
  if (!item) {
    return null;
  }
  return {
    item: item,
    url: wowheadUrl(item),
    tooltip: itemTooltip(item, props.slotDefinition.label),
    label: props.slotDefinition.label + ": " + item.name
  };
});

const emptyLabel = computed(function emptySlotLabel() {
  return props.slotDefinition.label + ": empty";
});

const upgrade = computed(function upgradeView() {
  if (props.options === null) {
    return null;
  }
  const best = props.options.best;
  return {
    item: best.item,
    href: "#upgrade-" + props.slotDefinition.key,
    tooltip: comparisonTooltip(props.slotDefinition, props.snapshot, props.character, best),
    label: props.slotDefinition.label + " upgrade: " + best.item.name
  };
});
</script>

<template>
  <div :class="slotClasses">
    <a v-if="equipped" class="slot-equipped" :href="equipped.url" target="_blank" rel="noopener" :aria-label="equipped.label"><ItemIcon :item="equipped.item" size="icon-large" /><ComparisonTooltip :tooltip="equipped.tooltip" extra-class="" /></a>
    <a v-else class="slot-equipped" :aria-label="emptyLabel" role="img" tabindex="0"><span class="item-icon icon-large icon-empty"></span><span class="tooltip"><span>{{ slotDefinition.label }}</span><span>Empty</span></span></a>
    <a v-if="upgrade" class="slot-upgrade" :href="upgrade.href" :aria-label="upgrade.label"><ItemIcon :item="upgrade.item" size="icon-small" /><span class="upgrade-marker">▲</span><ComparisonTooltip :tooltip="upgrade.tooltip" extra-class="tooltip-comparison" /></a>
  </div>
</template>
