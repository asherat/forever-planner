<script setup lang="ts">
import { computed } from "vue";
import { dungeonByName } from "../route.ts";
import type { GuideZone } from "../types.ts";
import { hasMap, zoneMapAttributes } from "../ui/map-target.ts";
import { pickZone } from "../ui/route-actions.ts";
import { tierColor } from "../ui/tiers.ts";
import TierBadge from "./TierBadge.vue";

const props = defineProps<{ zone: GuideZone; label: string }>();

function dungeonLabel(dungeonName: string): string {
  const known = dungeonByName(dungeonName);
  if (known === null) {
    return dungeonName;
  }
  return known.name + " (" + known.minLevel + "+)";
}

function dungeonNameOf(dungeon: { name: string }): string {
  return dungeonLabel(dungeon.name);
}

const mapAttributes = computed(function zoneAttributes() {
  return zoneMapAttributes(props.zone);
});

const classes = computed(function choiceClasses() {
  const classNames = ["zone-choice", tierColor(props.zone.tier)];
  if (hasMap(mapAttributes.value)) {
    classNames.push("has-map");
  }
  return classNames.join(" ");
});

const dungeons = computed(function dungeonLine() {
  const names = (props.zone.dungeons || []).map(dungeonNameOf);
  if (names.length === 0) {
    return "";
  }
  return "Dungeons: " + names.join(", ");
});

function choose(): void {
  pickZone(props.zone.name);
}
</script>

<template>
  <button type="button" :class="classes" v-bind="mapAttributes" @click="choose">
    <span class="zone-choice-title">
      <TierBadge :tier="zone.tier" />
      {{ zone.name }}
      <span class="zone-range">{{ label }}</span>
    </span>
    <span class="zone-note">{{ zone.note }}</span>
    <span v-if="dungeons" class="zone-dungeons">{{ dungeons }}</span>
  </button>
</template>
