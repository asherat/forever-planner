<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { itemById } from "../sources.ts";
import { addCraftedUpgrades, cartEntries, changeQuantity, clearCart, craftAllHref, missingCraftedUpgrades, removeFromCart } from "../ui/crafting-cart.ts";
import { renderTick } from "../ui/render-tick.ts";
import ItemIcon from "./ItemIcon.vue";
import WowheadLink from "./WowheadLink.vue";

const rows = computed(function cartRows() {
  renderTick.value;
  return cartEntries().map(function rowOf(entry, index) {
    return { key: index + ":" + entry.itemId, index: index, item: itemById(entry.itemId), fallbackName: "Item " + entry.itemId, quantity: String(entry.quantity), inputId: "cart-quantity-" + index };
  });
});

const isEmpty = computed(function cartIsEmpty() {
  return rows.value.length === 0;
});

const hasEntries = computed(function cartHasEntries() {
  return rows.value.length > 0;
});

const missingCount = computed(function craftedMissing() {
  renderTick.value;
  return missingCraftedUpgrades().length;
});

const hasMissing = computed(function anyCraftedMissing() {
  return missingCount.value > 0;
});

const addLabel = computed(function addCraftedLabel() {
  return "Add crafted upgrades (" + missingCount.value + ")";
});

const href = computed(function craftAllAddress() {
  renderTick.value;
  return craftAllHref();
});

function quantityChanged(index: number, event: Event): void {
  changeQuantity(index, (event.target as HTMLInputElement).value);
}
</script>

<template>
  <p v-if="isEmpty" id="crafting-cart-empty" class="muted">Empty. Add crafted upgrades one by one with "Add to crafting list", or all at once below.</p>
  <ul v-else id="crafting-cart-items" class="crafting-cart-items">
    <li v-for="row in rows" :key="row.key" class="crafting-cart-row">
      <template v-if="row.item"><ItemIcon :item="row.item" size="icon-small" /><WowheadLink :item="row.item" /></template>
      <span v-else>{{ row.fallbackName }}</span>
      <input :id="row.inputId" class="cart-quantity" type="number" min="1" :value="row.quantity" aria-label="How many" @change="quantityChanged(row.index, $event)">
      <button class="cart-remove" type="button" aria-label="Remove from crafting list" @click="removeFromCart(row.index)">×</button>
    </li>
  </ul>
  <button v-if="hasMissing" id="add-crafted-button" type="button" @click="addCraftedUpgrades">{{ addLabel }}</button>
  <div v-if="hasEntries" id="crafting-cart-actions" class="inline-fields">
    <a id="craft-all-link" class="button-link primary" :href="href">Craft all</a>
    <button id="clear-cart-button" type="button" @click="clearCart">Clear list</button>
  </div>
</template>
