<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { addCharacterFromForm, addCharacterNamed, characterRows, foundCharacters, removeCharacter, settingsForm } from "../ui/settings.ts";
import type { FoundCharacter } from "../ui/settings.ts";

const rows = computed(function rowsView() {
  return characterRows();
});

const found = computed(function foundView() {
  return foundCharacters();
});

const hasFound = computed(function anyFound() {
  return found.value.length > 0;
});

function addFound(character: FoundCharacter): void {
  addCharacterNamed(character.name, character.surname);
}
</script>

<template>
  <div id="character-list" class="character-list">
    <div v-for="row in rows" :key="row.slug" class="character-row"><span class="character-row-name">{{ row.name }}</span><span class="muted">{{ row.summary }}</span><button class="character-remove" type="button" :aria-label="row.removeLabel" @click="removeCharacter(row.slug)">×</button></div>
  </div>
  <div v-if="hasFound" id="found-characters" class="found-characters">
    <p class="muted">Found in your WoW folder:</p>
    <button v-for="character in found" :key="character.label" class="found-character" type="button" @click="addFound(character)">{{ character.label }}</button>
  </div>
  <div class="add-character">
    <input id="new-character-name" v-model="settingsForm.newName" placeholder="First name" aria-label="First name" @keydown.enter="addCharacterFromForm">
    <input id="new-character-surname" v-model="settingsForm.newSurname" placeholder="Surname" aria-label="Surname" @keydown.enter="addCharacterFromForm">
    <button id="add-character-button" type="button" @click="addCharacterFromForm">Add</button>
  </div>
  <div class="settings-row">
    <label for="lookahead-input">Show upgrades up to</label>
    <input id="lookahead-input" v-model="settingsForm.lookahead" type="number" min="0" max="10">
    <span class="muted">levels above you</span>
  </div>
</template>
