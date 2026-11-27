<script setup lang="ts">
import { computed } from "vue";
import { lastHidden, undoLastHide } from "../ui/not-interested.ts";

const notice = computed(function undoText() {
  if (lastHidden.value === null) {
    return "";
  }
  return lastHidden.value.text;
});

const isShown = computed(function hasUndo() {
  return lastHidden.value !== null;
});
</script>

<template>
  <p v-if="isShown" class="undo-notice" role="status">
    {{ notice }}
    <button type="button" class="link" @click="undoLastHide">Undo</button>
  </p>
</template>
