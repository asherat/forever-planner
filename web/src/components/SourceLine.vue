<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import type { ItemSource } from "../types.ts";
import { hasMap, mapTargetAttributes } from "../ui/map-target.ts";
import type { MapAttributes } from "../ui/map-target.ts";
import { creatureLevelText, creatureRankText, describeSource, joinDetails, sourcePlace } from "../ui/upgrade-card.ts";

const props = defineProps<{ source: ItemSource }>();

const linked = computed(function linkedSource() {
  const source = props.source;
  if (source.type === "quest") {
    let levelPart = "";
    if (source.level) {
      levelPart = "level " + source.level;
    }
    return { prefix: "Quest: ", url: WOWHEAD_URL + "quest=" + source.questId, name: String(source.quest), suffix: joinDetails([levelPart, source.zone]) };
  }
  if (source.type === "vendor") {
    let title = "";
    if (source.title) {
      title = ", " + String(source.title);
    }
    return { prefix: "Vendor: ", url: WOWHEAD_URL + "npc=" + source.npcId, name: String(source.npc), suffix: title + joinDetails([source.zone]) };
  }
  if (source.type === "drop") {
    return { prefix: "Drops from ", url: WOWHEAD_URL + "npc=" + source.npcId, name: String(source.npc), suffix: joinDetails([creatureLevelText(source), creatureRankText(source.rank), source.zone]) };
  }
  return null;
});

const plainText = computed(function sourceText() {
  return describeSource(props.source);
});

const mapAttributes = computed(function sourceMap(): MapAttributes {
  const place = sourcePlace(props.source);
  if (place === null) {
    return {};
  }
  return mapTargetAttributes(place.zone, place.x, place.y, place.caption);
});

const classes = computed(function lineClasses() {
  if (hasMap(mapAttributes.value)) {
    return "has-map";
  }
  return undefined;
});

const focusable = computed(function lineTabIndex() {
  if (hasMap(mapAttributes.value)) {
    return 0;
  }
  return undefined;
});
</script>

<template>
  <li :class="classes" v-bind="mapAttributes" :tabindex="focusable">
    <template v-if="linked">{{ linked.prefix }}<a class="wowhead-link" :href="linked.url" target="_blank" rel="noopener">{{ linked.name }}</a>{{ linked.suffix }}</template>
    <template v-else>{{ plainText }}</template>
  </li>
</template>
