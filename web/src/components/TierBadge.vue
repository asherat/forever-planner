<script setup lang="ts">
import { computed } from "vue";
import { tierColor } from "../ui/tiers.ts";

const props = defineProps<{ tier: string }>();

const classes = computed(function badgeClasses() {
  return "tier-badge " + tierColor(props.tier);
});
</script>

<template>
  <span :class="classes">{{ tier }}</span>
</template>
