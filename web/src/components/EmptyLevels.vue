<script setup lang="ts">
import { computed } from "vue";
import { guideZone, nextZoneSuggestions } from "../route.ts";
import type { GuideZone, RouteLeg, Snapshot } from "../types.ts";
import { fillLevels, startEarlier } from "../ui/route-actions.ts";
import { tierColor } from "../ui/tiers.ts";
import TierBadge from "./TierBadge.vue";

const props = defineProps<{ leg: RouteLeg; index: number; nextZone: string; snapshot: Snapshot }>();

const removedZones = computed(function removedNames() {
  return props.leg.removedZones || [];
});

const question = computed(function emptyQuestion() {
  return "Levels " + props.leg.fromLevel + "–" + props.leg.toLevel + " are empty (you removed " + removedZones.value.join(" and ") + "). Where do you want to level instead?";
});

function isNotRemoved(zone: GuideZone): boolean {
  return removedZones.value.indexOf(zone.name) === -1;
}

interface Filler {
  zone: GuideZone;
  classes: string;
  text: string;
  pick: () => void;
}

function fillerFor(zone: GuideZone): Filler {
  const index = props.index;
  return {
    zone: zone,
    classes: "route-gap-option " + tierColor(zone.tier),
    text: " " + zone.name + " from " + props.leg.fromLevel + " to " + props.leg.toLevel,
    pick: function fillWithZone() {
      fillLevels(index, zone.name);
    }
  };
}

const fillers = computed(function fillerChoices() {
  return nextZoneSuggestions(props.leg.fromLevel, props.snapshot.factionType, props.nextZone).ready.filter(isNotRemoved).slice(0, 3).map(fillerFor);
});

const startEarlyText = computed(function earlyText() {
  let text = "Start " + props.nextZone + " at " + props.leg.fromLevel;
  const next = guideZone(props.nextZone);
  if (next !== null && next.minLevel > props.leg.fromLevel + 1) {
    text += " (quests will be harder)";
  }
  return text;
});

function startNextEarlier(): void {
  startEarlier(props.index);
}
</script>

<template>
  <li class="route-gap">
    <p>{{ question }}</p>
    <button v-for="filler in fillers" :key="filler.zone.name" type="button" :class="filler.classes" @click="filler.pick">
      <TierBadge :tier="filler.zone.tier" />{{ filler.text }}
    </button>
    <button type="button" class="route-gap-option" @click="startNextEarlier">{{ startEarlyText }}</button>
  </li>
</template>
