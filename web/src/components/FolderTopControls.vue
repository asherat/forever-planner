<script setup lang="ts">
import { computed } from "vue";
import { chooseScope, currentScopeKey, isReading, refreshFolderData, scopeOptions } from "../ui/folder-controls.ts";

const scopes = computed(function scopesView() {
  return { options: scopeOptions(), selected: currentScopeKey() };
});

const hasOneScope = computed(function singleScope() {
  return scopes.value.options.length < 2;
});

function scopeChosen(event: Event): void {
  chooseScope((event.target as HTMLSelectElement).value);
}
</script>

<template>
  <select id="scope-select" aria-label="Ruleset and faction" :hidden="hasOneScope" :value="scopes.selected" @change="scopeChosen">
    <option v-for="option in scopes.options" :key="option.key" :value="option.key">{{ option.label }}</option>
  </select>
  <button id="crafting-refresh-button" type="button" class="primary" :disabled="isReading" @click="refreshFolderData">Refresh</button>
</template>
