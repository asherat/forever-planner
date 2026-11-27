<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import type { Place } from "../questie.ts";
import { hasMap, mapTargetAttributes } from "../ui/map-target.ts";
import type { MapAttributes } from "../ui/map-target.ts";
import { copyWaypoint, waypointText } from "../ui/quest-steps.ts";
import { placeForSource } from "../map-popover.ts";

const props = defineProps<{ place: Place | null }>();

const description = computed(function placeText() {
  if (props.place === null) {
    return "Quest giver unknown";
  }
  let text = "From " + props.place.name;
  if (props.place.title) {
    text += ", " + props.place.title;
  }
  if (props.place.kind === "item") {
    text = "Starts from " + props.place.name;
  }
  if (props.place.zone) {
    text += " in " + props.place.zone;
  }
  return text;
});

const mapAttributes = computed(function placeMap(): MapAttributes {
  if (props.place === null || !props.place.zone) {
    return {};
  }
  return mapTargetAttributes(props.place.zone, props.place.x, props.place.y, placeForSource(props.place).caption);
});

const classes = computed(function placeClasses() {
  if (hasMap(mapAttributes.value)) {
    return "quest-step-place has-map";
  }
  return "quest-step-place";
});

const waypoint = computed(function waypointCommand() {
  if (props.place === null) {
    return "";
  }
  return waypointText(props.place);
});

const coordinates = computed(function coordinateText() {
  if (props.place === null || props.place.x === null || props.place.y === null) {
    return "";
  }
  return "(" + props.place.x.toFixed(1) + ", " + props.place.y.toFixed(1) + ")";
});

const waypointTitle = computed(function waypointHint() {
  return "Copy " + waypoint.value + " for Questie or TomTom";
});

function copy(): void {
  copyWaypoint(waypoint.value);
}
</script>

<template>
  <div :class="classes" v-bind="mapAttributes">
    {{ description }}
    <template v-if="coordinates">
      <button type="button" class="waypoint" :title="waypointTitle" @click="copy">{{ coordinates }}</button>
    </template>
  </div>
</template>
