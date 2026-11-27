<script setup lang="ts">
import { computed } from "vue";
import { craftingItem } from "../crafting-plan.ts";
import type { Item } from "../types.ts";
import ItemIcon from "./ItemIcon.vue";
import WowheadLink from "./WowheadLink.vue";

const props = defineProps<{ itemId: number }>();

const item = computed(function labelItem() {
  return craftingItem(props.itemId) as unknown as Item;
});
</script>

<template>
  <span class="crafting-item"><ItemIcon :item="item" size="icon-small" /><WowheadLink :item="item" /></span>
</template>
