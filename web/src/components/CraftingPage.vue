<script setup lang="ts">
import { computed, ref } from "vue";
import "../legacy.ts";
import { aggregatePlans, planList } from "../crafting-plan.ts";
import { crafting } from "../crafting-plan.ts";
import type { Plan } from "../crafting-plan.ts";
import { addByName, searchNames, shareMaterials } from "../ui/crafting-page.ts";
import { connectFolder, dataStatusText } from "../ui/folder-controls.ts";
import CraftingEntry from "./CraftingEntry.vue";
import CraftingSummary from "./CraftingSummary.vue";
import { state } from "../state.ts";

const search = ref("");
const searchQuantity = ref("1");
const names = searchNames();

interface PlanRow {
  key: string;
  index: number;
  plan: Plan;
  moveUp: number | null;
  moveDown: number | null;
}

function isBoughtReadyMade(plan: Plan): boolean {
  return plan.root.recipe === null;
}

const plans = computed(function currentPlans(): PlanRow[] {
  return planList().map(function entryOf(plan, index) {
    return { key: index + ":" + plan.entry.itemId, index: index, plan: plan, moveUp: null, moveDown: null };
  });
});

const boughtRows = computed(function boughtPlans() {
  return plans.value.filter(function isBought(row) {
    return isBoughtReadyMade(row.plan);
  });
});

const craftedRows = computed(function craftedPlans(): PlanRow[] {
  const crafted = plans.value.filter(function isCrafted(row) {
    return !isBoughtReadyMade(row.plan);
  });
  return crafted.map(function withMoves(row, position) {
    let moveUp: number | null = null;
    let moveDown: number | null = null;
    if (position > 0) {
      moveUp = crafted[position - 1].index;
    }
    if (position < crafted.length - 1) {
      moveDown = crafted[position + 1].index;
    }
    return { key: row.key, index: row.index, plan: row.plan, moveUp: moveUp, moveDown: moveDown };
  });
});

const hasBought = computed(function anyBought() {
  return boughtRows.value.length > 0;
});

const hasCrafted = computed(function anyCrafted() {
  return craftedRows.value.length > 0;
});

const sharing = computed(function sharingView() {
  return { isShared: crafting.list.sharesMaterials, isLocked: !crafting.list.useInventory };
});

function sharingToggled(event: Event): void {
  shareMaterials((event.target as HTMLInputElement).checked);
}

const totals = computed(function planTotals() {
  return aggregatePlans(plans.value.map(function planOf(row) {
    return row.plan;
  }));
});

const hasPlans = computed(function anyPlans() {
  return plans.value.length > 0;
});

const status = computed(function folderStatus() {
  return { text: dataStatusText(), isConnected: Boolean(state.wowFolderConnected) };
});

function addSearched(): void {
  if (addByName(search.value, searchQuantity.value)) {
    search.value = "";
  }
}
</script>

<template>
  <section class="panel crafting-intro">
    <h1>Crafting</h1>
    <p id="crafting-data-status" class="muted">{{ status.text }}</p>
    <div class="inline-fields">
      <button id="crafting-connect-button" type="button" :hidden="status.isConnected" @click="connectFolder">Connect WoW folder</button>
    </div>
  </section>

  <section class="crafting-add">
    <label for="crafting-search">Add something to craft</label>
    <div class="inline-fields">
      <input id="crafting-search" v-model="search" list="crafting-search-options" placeholder="Item name, e.g. Nightscape Cloak" autocomplete="off" @keydown.enter="addSearched">
      <datalist id="crafting-search-options"><option v-for="name in names" :key="name" :value="name"></option></datalist>
      <input id="crafting-search-quantity" v-model="searchQuantity" type="number" min="1" aria-label="Quantity">
      <button id="crafting-add-button" type="button" class="primary" @click="addSearched">Add</button>
    </div>
  </section>

  <section class="crafting-layout">
    <div class="crafting-list-column">
      <h2>Your crafting list</h2>
      <div id="crafting-empty" class="panel muted" :hidden="hasPlans">Nothing here yet. Add an item above, or pick crafted upgrades on the gear page and press "Craft all" in your gear plan.</div>
      <template v-if="hasBought">
        <h3 class="crafting-group-title">No crafting needed: buy it or use what you have</h3>
        <ol class="crafting-list">
          <CraftingEntry v-for="row in boughtRows" :key="row.key" :plan="row.plan" :index="row.index" :move-up="null" :move-down="null" />
        </ol>
      </template>
      <template v-if="hasCrafted">
        <h3 v-if="hasBought" class="crafting-group-title">To craft</h3>
        <label class="checkbox-line crafting-share"><input type="checkbox" :checked="sharing.isShared" :disabled="sharing.isLocked" @change="sharingToggled"> Use my materials in list order: the first craft takes them, the next ones get what's left. Reorder with ↑ ↓.</label>
        <ol id="crafting-list" class="crafting-list">
          <CraftingEntry v-for="row in craftedRows" :key="row.key" :plan="row.plan" :index="row.index" :move-up="row.moveUp" :move-down="row.moveDown" />
        </ol>
      </template>
    </div>
    <CraftingSummary :totals="totals" />
  </section>
</template>
