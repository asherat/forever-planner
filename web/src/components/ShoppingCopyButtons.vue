<script setup lang="ts">
import { copyShoppingList } from "../ui/shopping-export.ts";
import type { ExportLine } from "../ui/shopping-export.ts";

const props = defineProps<{ listName: string; lines: ExportLine[] }>();

function copyForTsm(): void {
  copyShoppingList("tsm", props.listName, props.lines);
}

function copyForAuctionator(): void {
  copyShoppingList("auctionator", props.listName, props.lines);
}

function copyAsText(): void {
  copyShoppingList("text", props.listName, props.lines);
}
</script>

<template>
  <p class="shopping-copy muted">
    {{ "Copy for " }}<button type="button" class="link" @click="copyForTsm">TSM</button>{{ " · " }}<button type="button" class="link" @click="copyForAuctionator">Auctionator</button>{{ " · " }}<button type="button" class="link" @click="copyAsText">as text</button>
  </p>
</template>
