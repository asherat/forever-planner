<script setup lang="ts">
import type { RecipeSourceView } from "../ui/recipe-sources.ts";

defineProps<{ source: RecipeSourceView }>();
</script>

<template>
  <span v-if="source.text" class="summary-value muted">{{ source.text }}</span>
  <span v-for="line in source.lines" :key="line.key" :class="line.classes" v-bind="line.mapAttributes">{{ line.prefix }}<a v-if="line.npcUrl" :href="line.npcUrl" target="_blank" rel="noopener">{{ line.npcName }}</a>{{ line.suffix }}{{ line.coordinates }}</span>
</template>
