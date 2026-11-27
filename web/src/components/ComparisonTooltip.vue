<script setup lang="ts">
import { computed } from "vue";
import type { Tooltip } from "../ui/upgrade-card.ts";

const props = defineProps<{ tooltip: Tooltip; extraClass: string }>();

const classes = computed(function tooltipClasses() {
  return ("tooltip " + props.extraClass).trim();
});

const titleClasses = computed(function titleClass() {
  return "tooltip-title " + props.tooltip.titleClass;
});

function lineClass(className: string): string {
  return "tooltip-line " + className;
}

const lines = computed(function tooltipLines() {
  return props.tooltip.lines.map(function withClass(line, index) {
    return { key: index, classes: lineClass(line.className), text: line.text };
  });
});
</script>

<template>
  <span :class="classes"><span :class="titleClasses">{{ tooltip.title }}</span><span class="tooltip-subtitle">{{ tooltip.subtitle }}</span><span v-for="line in lines" :key="line.key" :class="line.classes">{{ line.text }}</span></span>
</template>
