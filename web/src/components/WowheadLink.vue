<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import type { Item } from "../types.ts";
import { qualityClass, wowheadUrl } from "../prices.ts";

const props = defineProps<{ item: Item }>();

const quality = computed(function linkQuality() {
  return qualityClass(props.item.quality);
});

const address = computed(function linkAddress() {
  return wowheadUrl(props.item);
});
</script>

<template>
  <a :class="quality" :href="address" target="_blank" rel="noopener">{{ item.name }}</a>
</template>
