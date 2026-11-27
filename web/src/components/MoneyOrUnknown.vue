<script setup lang="ts">
import { computed } from "vue";
import MoneyAmount from "./MoneyAmount.vue";

const props = defineProps<{ copper: number; missing: boolean }>();

const hasNoPrice = computed(function noPriceAtAll() {
  return props.missing && props.copper === 0;
});
</script>

<template>
  <span v-if="hasNoPrice" class="muted">no price</span>
  <span v-else class="crafting-cost"><MoneyAmount :copper="copper" /><span v-if="missing" class="muted">{{ " + unpriced" }}</span></span>
</template>
