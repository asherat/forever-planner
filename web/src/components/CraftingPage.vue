<script setup lang="ts">
import { computed, ref } from "vue";
import "../legacy.ts";
import { aggregatePlans, planList } from "../crafting-plan.ts";
import { addByName, connectCraftingFolder, dataStatusText, searchNames } from "../ui/crafting-page.ts";
import CraftingEntry from "./CraftingEntry.vue";
import CraftingSummary from "./CraftingSummary.vue";
import { state } from "../state.ts";

const search = ref("");
const searchQuantity = ref("1");
const names = searchNames();

const plans = computed(function currentPlans() {
  return planList().map(function entryOf(plan, index) {
    return { key: index + ":" + plan.entry.itemId, index: index, plan: plan };
  });
});

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
      <button id="crafting-connect-button" type="button" :hidden="status.isConnected" @click="connectCraftingFolder">Connect WoW folder</button>
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
      <div id="crafting-empty" class="panel muted" :hidden="hasPlans">Nothing here yet. Add an item above, or collect crafted items with "Add to crafting list" in the gear planner and press "Craft all".</div>
      <ol id="crafting-list" class="crafting-list">
        <CraftingEntry v-for="row in plans" :key="row.key" :plan="row.plan" :index="row.index" />
      </ol>
    </div>
    <CraftingSummary :totals="totals" />
  </section>
</template>
