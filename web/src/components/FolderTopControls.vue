<script setup lang="ts">
import { computed } from "vue";
import { chooseScope, connectFolder, currentScopeKey, isReading, refreshFolderData, scopeOptions } from "../ui/folder-controls.ts";
import { state } from "../state.ts";

const scopes = computed(function scopesView() {
  return { options: scopeOptions(), selected: currentScopeKey() };
});

const hasOneScope = computed(function singleScope() {
  return scopes.value.options.length < 2;
});

const isConnected = computed(function folderConnected() {
  return state.wowFolderConnected;
});

function scopeChosen(event: Event): void {
  chooseScope((event.target as HTMLSelectElement).value);
}
</script>

<template>
  <select id="scope-select" aria-label="Ruleset and faction" :hidden="hasOneScope" :value="scopes.selected" @change="scopeChosen">
    <option v-for="option in scopes.options" :key="option.key" :value="option.key">{{ option.label }}</option>
  </select>
  <button v-if="isConnected" id="crafting-refresh-button" type="button" class="primary" :disabled="isReading" @click="refreshFolderData">Refresh</button>
  <button v-else id="crafting-connect-button" type="button" class="primary" @click="connectFolder">Connect WoW folder</button>
</template>
