<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { openSettings } from "../ui/settings.ts";
import { characterOptions, isRefreshing, refreshSelectedCharacter, selectCharacter } from "../ui/top-bar.ts";
import { state } from "../state.ts";

const options = computed(function optionsView() {
  return characterOptions();
});

const selectedSlug = computed(function selectedView() {
  return state.settings.selectedCharacterSlug;
});

const hasNoCharacters = computed(function noCharacters() {
  return options.value.length === 0;
});

function characterChosen(event: Event): void {
  selectCharacter((event.target as HTMLSelectElement).value);
}
</script>

<template>
  <select id="character-select" aria-label="Character" :hidden="hasNoCharacters" :value="selectedSlug" @change="characterChosen">
    <option v-for="option in options" :key="option.slug" :value="option.slug">{{ option.name }}</option>
  </select>
  <button id="refresh-button" type="button" class="primary" :disabled="isRefreshing" @click="refreshSelectedCharacter">Refresh</button>
  <button id="settings-button" type="button" @click="openSettings">Settings</button>
</template>
