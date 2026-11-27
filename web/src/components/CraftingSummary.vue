<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { crafting } from "../crafting-plan.ts";
import type { PlanTotals } from "../crafting-plan.ts";
import { chooseBartering, crafterRow, includeCharacter, inventoryRows, shoppingText, useInventory } from "../ui/crafting-page.ts";
import { takingPlaces } from "../ui/inventory-text.ts";
import CraftingItemLabel from "./CraftingItemLabel.vue";
import MoneyAmount from "./MoneyAmount.vue";
import MoneyOrUnknown from "./MoneyOrUnknown.vue";

const props = defineProps<{ totals: PlanTotals }>();

const shopping = computed(function shoppingView() {
  return props.totals.shopping.map(function rowOf(line) {
    let where = "";
    if (line.offer !== null) {
      where = " " + line.offer.where;
    }
    return { key: line.itemId, itemId: line.itemId, quantity: shoppingText(line), hasPrice: line.offer !== null, cost: line.cost, where: where };
  });
});

const taking = computed(function takingView() {
  return props.totals.taking.map(function rowOf(line) {
    return { key: line.character + "|" + line.itemId, itemId: line.itemId, count: " ×" + line.count, places: takingPlaces(line) };
  });
});

const crafters = computed(function craftersView() {
  return props.totals.professions.map(crafterRow);
});

const hasNoShopping = computed(function nothingToBuy() {
  return shopping.value.length === 0;
});

const hasTaking = computed(function somethingToTake() {
  return taking.value.length > 0;
});

const hasCrafters = computed(function somethingToCraft() {
  return crafters.value.length > 0;
});

const settings = computed(function listSettings() {
  return { bartering: String(crafting.list.barteringRank || 0), useInventory: crafting.list.useInventory, isLocked: !crafting.list.useInventory };
});

const inventory = computed(function inventoryView() {
  return inventoryRows();
});

const hasNoInventory = computed(function inventoryMissing() {
  return inventory.value === null;
});

const inventoryCharacters = computed(function inventoryCharacterRows() {
  return inventory.value || [];
});

function barteringChanged(event: Event): void {
  chooseBartering((event.target as HTMLSelectElement).value);
}

function inventoryToggled(event: Event): void {
  useInventory((event.target as HTMLInputElement).checked);
}

function characterToggled(name: string, event: Event): void {
  includeCharacter(name, (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <aside class="crafting-summary">
    <section class="panel">
      <h2>Total</h2>
      <div id="crafting-total">{{ "Gold you'll spend: " }}<MoneyOrUnknown :copper="totals.total" :missing="totals.missing" /></div>
    </section>
    <section class="panel">
      <h2>Shopping list</h2>
      <ul id="shopping-list" class="summary-list">
        <li v-if="hasNoShopping" class="muted">Nothing to buy.</li>
        <li v-for="line in shopping" :key="line.key" class="summary-row"><span class="summary-label"><CraftingItemLabel :item-id="line.itemId" />{{ line.quantity }}</span><span v-if="line.hasPrice" class="summary-value"><MoneyAmount :copper="line.cost" />{{ line.where }}</span><span v-else class="muted">no price</span></li>
      </ul>
    </section>
    <section v-if="hasTaking" class="panel">
      <h2>Take from your characters</h2>
      <ul id="take-list" class="summary-list">
        <li v-for="line in taking" :key="line.key" class="summary-row"><span class="summary-label"><CraftingItemLabel :item-id="line.itemId" />{{ line.count }}</span><span class="summary-value muted">{{ line.places }}</span></li>
      </ul>
    </section>
    <section v-if="hasCrafters" class="panel">
      <h2>Who can craft</h2>
      <ul id="crafter-list" class="summary-list">
        <li v-for="row in crafters" :key="row.profession" class="summary-row"><span class="summary-label">{{ row.profession }}</span><span :class="row.classes">{{ row.names }}</span></li>
      </ul>
    </section>
    <section class="panel">
      <h2>Options</h2>
      <label for="bartering-select">Vendor discount: Bartering (Legacy perk) on the character who buys</label>
      <select id="bartering-select" :value="settings.bartering" @change="barteringChanged">
        <option value="0">None</option>
        <option value="1">Rank 1 (5% off)</option>
        <option value="2">Rank 2 (10% off)</option>
      </select>
      <label class="checkbox-line"><input id="use-inventory" type="checkbox" :checked="settings.useInventory" @change="inventoryToggled"> Use materials my characters have</label>
      <div id="inventory-characters">
        <p v-if="hasNoInventory" class="muted">Connect your WoW folder to use what your characters have. TSM saves bags and banks when a character logs out.</p>
        <template v-for="row in inventoryCharacters" :key="row.key"><p v-if="row.account" class="inventory-account">{{ row.account }}</p><label class="checkbox-line"><input type="checkbox" :checked="row.included" :disabled="settings.isLocked" @change="characterToggled(row.name, $event)">{{ row.label }}<MoneyAmount :copper="row.money" /></label></template>
      </div>
    </section>
  </aside>
</template>
