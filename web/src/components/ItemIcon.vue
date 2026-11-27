<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import type { Item } from "../types.ts";
import { iconUrlForItem, qualityClass } from "../prices.ts";

const props = defineProps<{ item: Item; size: string }>();

const classes = computed(function iconClasses() {
  return "item-icon " + props.size + " " + qualityClass(props.item.quality);
});

const source = computed(function iconSource() {
  return iconUrlForItem(props.item);
});
</script>

<template>
  <img :class="classes" :src="source" alt="" loading="lazy">
</template>
