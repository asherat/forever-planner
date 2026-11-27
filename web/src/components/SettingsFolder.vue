<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { renderTick } from "../ui/render-tick.ts";
import { connectWowFolder, disconnectWowFolder, folderStatusText, sourceStatuses } from "../ui/settings.ts";

const folderStatus = computed(function folderStatusView() {
  renderTick.value;
  return folderStatusText();
});

const statuses = computed(function statusRows() {
  renderTick.value;
  return sourceStatuses().map(function withClass(status) {
    let className = "";
    if (status.found) {
      className = "source-found";
    }
    return { key: status.key, text: status.text, className: className };
  });
});
</script>

<template>
  <p class="muted">Pick your <code>World of Warcraft</code> or <code>_forever_</code> folder. The planner only reads it, on every Refresh; nothing leaves your PC.</p>
  <p id="wow-folder-status" class="folder-status">{{ folderStatus }}</p>
  <ul class="source-checklist">
    <li v-for="status in statuses" :id="status.key" :key="status.key" :class="status.className">{{ status.text }}</li>
  </ul>
  <div class="inline-fields">
    <button id="wow-folder-connect-button" type="button" @click="connectWowFolder">Connect WoW folder</button>
    <button id="wow-folder-disconnect-button" type="button" class="link" @click="disconnectWowFolder">Disconnect</button>
  </div>
</template>
