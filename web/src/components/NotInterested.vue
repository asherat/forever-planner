<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { itemById } from "../sources.ts";
import { restoreDungeon, restoreItem } from "../ui/not-interested.ts";
import { renderTick } from "../ui/render-tick.ts";
import type { Item } from "../types.ts";
import ItemIcon from "./ItemIcon.vue";
import WowheadLink from "./WowheadLink.vue";
import { selectedCharacter } from "../state.ts";

interface HiddenEntry {
  key: string;
  label: string;
  item: Item | null;
  restore: () => void;
}

function dungeonEntry(dungeonName: string): HiddenEntry {
  return {
    key: "dungeon-" + dungeonName,
    label: dungeonName + " (dungeon)",
    item: null,
    restore: function bringBackDungeon() {
      restoreDungeon(dungeonName);
    }
  };
}

function itemEntry(itemId: number): HiddenEntry {
  return {
    key: "item-" + itemId,
    label: "Item " + itemId,
    item: itemById(itemId),
    restore: function bringBackItem() {
      restoreItem(itemId);
    }
  };
}

const entries = computed(function hiddenEntries() {
  renderTick.value;
  const character = selectedCharacter();
  if (character === null) {
    return [];
  }
  return (character.skippedDungeons || []).map(dungeonEntry).concat((character.hiddenItemIds || []).map(itemEntry));
});

const hasEntries = computed(function anyHidden() {
  return entries.value.length > 0;
});
</script>

<template>
  <div v-if="hasEntries" class="hidden-items">
    <h3>Not interested</h3>
    <ul>
      <li v-for="entry in entries" :key="entry.key" class="hidden-item">
        <template v-if="entry.item">
          <ItemIcon :item="entry.item" size="icon-small" />
          <WowheadLink :item="entry.item" />
        </template>
        <span v-else>{{ entry.label }}</span>
        <button type="button" class="link" @click="entry.restore">Bring back</button>
      </li>
    </ul>
  </div>
</template>
