<script setup lang="ts">
import { computed } from "vue";
import { SETTINGS_TABS, closeSettings, exportSettings, importSettings, settingsForm, showSettingsTab } from "../ui/settings.ts";
import SettingsCharacters from "./SettingsCharacters.vue";
import SettingsFolder from "./SettingsFolder.vue";

const tabs = computed(function tabsView() {
  return SETTINGS_TABS.map(function tabOf(tab) {
    const selected = tab.key === settingsForm.tab;
    let tabIndex = -1;
    if (selected) {
      tabIndex = 0;
    }
    return { key: tab.key, label: tab.label, id: "settings-tab-" + tab.key, panel: "settings-panel-" + tab.key, selected: selected, tabIndex: tabIndex };
  });
});

const hidden = computed(function hiddenPanels() {
  return {
    characters: settingsForm.tab !== "characters",
    battlenet: settingsForm.tab !== "battlenet",
    folder: settingsForm.tab !== "folder",
    backup: settingsForm.tab !== "backup"
  };
});

function enterPressed(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (target.tagName !== "INPUT") {
    return;
  }
  event.preventDefault();
}

function fileChosen(event: Event): void {
  const files = (event.target as HTMLInputElement).files;
  if (files !== null && files.length > 0) {
    importSettings(files[0]);
  }
}
</script>

<template>
  <dialog id="settings-dialog" aria-labelledby="settings-title" @close="closeSettings">
    <form id="settings-form" method="dialog" novalidate @keydown.enter="enterPressed">
      <div class="settings-header">
        <h2 id="settings-title">Settings</h2>
        <button id="settings-save-button" type="submit" class="settings-close" aria-label="Close settings">×</button>
      </div>
      <div class="settings-tabs" role="tablist" aria-label="Settings sections">
        <button v-for="tab in tabs" :id="tab.id" :key="tab.key" type="button" role="tab" :aria-controls="tab.panel" :aria-selected="tab.selected" :tabindex="tab.tabIndex" :data-settings-tab="tab.key" @click="showSettingsTab(tab.key)">{{ tab.label }}</button>
      </div>

      <div class="settings-panels">
        <section id="settings-panel-characters" role="tabpanel" aria-labelledby="settings-tab-characters" class="settings-panel" :hidden="hidden.characters">
          <SettingsCharacters />
        </section>

        <section id="settings-panel-battlenet" role="tabpanel" aria-labelledby="settings-tab-battlenet" class="settings-panel" :hidden="hidden.battlenet">
          <p class="muted">Create a client at <a href="https://develop.battle.net/access/clients" target="_blank" rel="noopener">develop.battle.net</a>. It stays in this browser and is only sent to Battle.net.</p>
          <div class="settings-grid">
            <label for="client-id-input">Client ID</label>
            <input id="client-id-input" v-model="settingsForm.clientId" autocomplete="off" spellcheck="false">
            <label for="client-secret-input">Client secret</label>
            <input id="client-secret-input" v-model="settingsForm.clientSecret" class="masked-input" autocomplete="off" spellcheck="false">
            <label for="region-select">Region</label>
            <select id="region-select" v-model="settingsForm.region">
              <option value="eu">EU</option>
              <option value="us">US</option>
              <option value="kr">KR</option>
              <option value="tw">TW</option>
            </select>
          </div>
        </section>

        <section id="settings-panel-folder" role="tabpanel" aria-labelledby="settings-tab-folder" class="settings-panel" :hidden="hidden.folder">
          <SettingsFolder />
        </section>

        <section id="settings-panel-backup" role="tabpanel" aria-labelledby="settings-tab-backup" class="settings-panel" :hidden="hidden.backup">
          <p class="muted">Saves your characters, leveling paths and hidden items to a file. The client secret is never included.</p>
          <div class="inline-fields">
            <button id="export-button" type="button" @click="exportSettings">Save settings file</button>
            <label class="file-button">Load settings file<input id="import-input" type="file" accept="application/json" @change="fileChosen"></label>
          </div>
        </section>
      </div>
    </form>
  </dialog>
</template>
