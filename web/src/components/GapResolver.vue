<script setup lang="ts">
import { computed } from "vue";
import { nextZoneSuggestions } from "../route.ts";
import type { PendingGap } from "../route.ts";
import type { GuideZone, RouteLeg, Snapshot } from "../types.ts";
import { cancelGap, closeGap } from "../ui/route-actions.ts";
import { tierColor } from "../ui/tiers.ts";
import TierBadge from "./TierBadge.vue";

const props = defineProps<{ gap: PendingGap; legs: RouteLeg[]; snapshot: Snapshot }>();

const question = computed(function gapQuestion() {
  return props.gap.zone + " starts at level " + props.gap.startLevel + ", but your path reaches " + props.gap.fromLevel + ". How do you want to close the gap?";
});

const stayText = computed(function stayLabel() {
  if (props.legs.length === 0) {
    return "";
  }
  return "Stay in " + props.legs[props.legs.length - 1].zone + " until " + props.gap.startLevel;
});

interface Filler {
  zone: GuideZone;
  classes: string;
  text: string;
  pick: () => void;
}

function fillerFor(zone: GuideZone): Filler {
  return {
    zone: zone,
    classes: "route-gap-option " + tierColor(zone.tier),
    text: " Fill " + props.gap.fromLevel + "–" + props.gap.startLevel + " in " + zone.name,
    pick: function fillWithZone() {
      closeGap("fill", zone.name);
    }
  };
}

const fillers = computed(function gapFillers() {
  return nextZoneSuggestions(props.gap.fromLevel, props.snapshot.factionType, props.gap.zone).ready.slice(0, 3).map(fillerFor);
});

const earlyText = computed(function startEarlyLabel() {
  return "Start " + props.gap.zone + " early at " + props.gap.fromLevel + " (quests will be harder)";
});

function stay(): void {
  closeGap("stay", undefined);
}

function startEarly(): void {
  closeGap("early", undefined);
}
</script>

<template>
  <div class="route-gap">
    <p>{{ question }}</p>
    <button v-if="stayText" type="button" class="route-gap-option" @click="stay">{{ stayText }}</button>
    <button v-for="filler in fillers" :key="filler.zone.name" type="button" :class="filler.classes" @click="filler.pick">
      <TierBadge :tier="filler.zone.tier" />{{ filler.text }}
    </button>
    <button type="button" class="route-gap-option" @click="startEarly">{{ earlyText }}</button>
    <button type="button" class="link" @click="cancelGap">Cancel</button>
  </div>
</template>
