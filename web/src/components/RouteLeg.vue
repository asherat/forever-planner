<script setup lang="ts">
import { computed } from "vue";
import { guideZone, MAX_CHARACTER_LEVEL } from "../route.ts";
import type { RouteLeg, Snapshot } from "../types.ts";
import { hasMap, zoneMapAttributes } from "../ui/map-target.ts";
import type { MapAttributes } from "../ui/map-target.ts";
import { changeLegEnd, removeZone } from "../ui/route-actions.ts";
import { tierColor } from "../ui/tiers.ts";
import TierBadge from "./TierBadge.vue";

const props = defineProps<{ leg: RouteLeg; index: number; snapshot: Snapshot }>();

const zone = computed(function legZone() {
  return guideZone(props.leg.zone);
});

const tier = computed(function legTier() {
  if (zone.value === null) {
    return "C";
  }
  return zone.value.tier;
});

const classes = computed(function legClasses() {
  const classNames = ["route-leg", tierColor(tier.value)];
  if (props.snapshot.level >= props.leg.fromLevel && props.snapshot.level < props.leg.toLevel) {
    classNames.push("route-leg-current");
  }
  if (props.snapshot.level >= props.leg.toLevel) {
    classNames.push("route-leg-done");
  }
  return classNames.join(" ");
});

const mapAttributes = computed(function legMapAttributes(): MapAttributes {
  if (zone.value === null) {
    return {};
  }
  return zoneMapAttributes(zone.value);
});

const zoneClasses = computed(function zoneLabelClasses() {
  if (hasMap(mapAttributes.value)) {
    return "route-leg-zone has-map";
  }
  return "route-leg-zone";
});

const focusable = computed(function zoneTabIndex() {
  if (zone.value === null) {
    return undefined;
  }
  return 0;
});

const lowestEnd = computed(function minimumEnd() {
  return props.leg.fromLevel + 1;
});

const inputId = computed(function endInputId() {
  return "route-end-" + props.index;
});

const endLabel = computed(function endAriaLabel() {
  return "Leave " + props.leg.zone + " at level";
});

const warnings = computed(function legWarnings() {
  const found: string[] = [];
  if (zone.value === null) {
    return found;
  }
  if (props.leg.toLevel > zone.value.maxLevel + 1) {
    found.push(" past the zone's range, quests turn green");
  }
  if (props.leg.fromLevel + 1 < zone.value.minLevel) {
    found.push(" · starts before the zone's level " + zone.value.minLevel + ", quests will be harder");
  }
  return found;
});

function remove(): void {
  removeZone(props.index);
}

function changeEnd(event: Event): void {
  changeLegEnd(props.index, (event.target as HTMLInputElement).value);
}
</script>

<template>
  <li :class="classes">
    <div class="route-leg-header">
      <TierBadge :tier="tier" />
      <span :class="zoneClasses" v-bind="mapAttributes" :tabindex="focusable">{{ leg.zone }}</span>
      <button type="button" class="link route-remove" @click="remove">Remove</button>
    </div>
    <div class="route-leg-levels">
      Level {{ leg.fromLevel }} to
      <input :id="inputId" class="route-end" type="number" :min="lowestEnd" :max="MAX_CHARACTER_LEVEL" :value="leg.toLevel" :aria-label="endLabel" @change="changeEnd">
      <span v-for="warning in warnings" :key="warning" class="route-warning">{{ warning }}</span>
    </div>
  </li>
</template>
