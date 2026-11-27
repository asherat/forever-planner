<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { activeSpec, specLabel } from "../scoring.ts";
import { renderTick } from "../ui/render-tick.ts";
import CraftingCart from "./CraftingCart.vue";
import NotInterested from "./NotInterested.vue";
import PlayControls from "./PlayControls.vue";
import PriorityList from "./PriorityList.vue";
import QuestList from "./QuestList.vue";
import RoutePanel from "./RoutePanel.vue";
import SlotColumn from "./SlotColumn.vue";
import UndoNotice from "./UndoNotice.vue";

const header = computed(function headerView() {
  renderTick.value;
  const character = selectedCharacter();
  if (character === null || !state.snapshots[character.slug]) {
    return null;
  }
  const snapshot = state.snapshots[character.slug];
  let renderClass = "character-render render-missing";
  let renderStyle: Record<string, string> = {};
  if (snapshot.render) {
    renderClass = "character-render";
    renderStyle = { "--render-image": "url(\"" + snapshot.render + "\")" };
  }
  return {
    name: character.displayName,
    meta: "Level " + snapshot.level + " " + snapshot.raceName + " " + snapshot.className + " · " + snapshot.faction + " · " + snapshot.ruleset,
    specs: "Comparing for " + specLabel(activeSpec(character)) + " · gear as of your logout on " + new Date(snapshot.lastLogout as number).toLocaleString(),
    faction: String(snapshot.factionType || "").toLowerCase(),
    renderClass: renderClass,
    renderStyle: renderStyle
  };
});

const isLoaded = computed(function characterLoaded() {
  return header.value !== null;
});

const isWaiting = computed(function nothingLoaded() {
  return header.value === null;
});

const lookahead = computed(function lookaheadLevels() {
  renderTick.value;
  return String(state.settings.lookaheadLevels);
});

const routeCredit = window.ZONE_GUIDE.credit;
</script>

<template>
  <section id="welcome" class="panel" :hidden="isLoaded">
    <h1>Set up</h1>
    <p>Add your Battle.net API client in Settings, then add a character by first name and surname. Your client secret is stored only in this browser and is sent only to Battle.net.</p>
  </section>

  <div class="planner-layout">
    <div class="planner-main">
      <section id="armory" class="armory" :hidden="isWaiting">
        <template v-if="header">
          <div class="character-header">
            <h1 id="character-name">{{ header.name }}</h1>
            <p id="character-meta" class="muted">{{ header.meta }}</p>
            <p id="character-specs" class="muted">{{ header.specs }}</p>
          </div>
          <div id="play-controls" class="play-controls"><PlayControls /></div>
          <div id="paperdoll" class="paperdoll" :data-faction="header.faction">
            <div id="slots-left" class="slot-column slot-column-left"><SlotColumn column="left" /></div>
            <div id="character-render" :class="header.renderClass" :style="header.renderStyle" role="img" :aria-label="header.name"></div>
            <div id="slots-right" class="slot-column slot-column-right"><SlotColumn column="right" /></div>
            <div id="slots-bottom" class="slot-row"><SlotColumn column="bottom" /></div>
          </div>
        </template>
      </section>

      <section id="priorities" :hidden="isWaiting">
        <h2>What to get next</h2>
        <p class="muted">Most valuable first. Each slot shows the best upgrade within <span id="lookahead-label">{{ lookahead }}</span> levels of you, and a quicker option you can use now when there is one.</p>
        <div id="undo-notice"><UndoNotice /></div>
        <ol id="priority-list" class="priority-list"><PriorityList /></ol>
        <div id="not-interested"><NotInterested /></div>
      </section>
    </div>

    <aside id="planner-sidebar" class="planner-sidebar" :hidden="isWaiting">
      <section id="route-panel" class="route-panel panel" aria-labelledby="route-title">
        <h2 id="route-title">Leveling path</h2>
        <div id="route-content"><RoutePanel /></div>
        <p id="route-credit" class="muted route-credit">{{ routeCredit }}</p>
      </section>
      <section id="crafting-cart" class="crafting-cart panel" aria-labelledby="crafting-cart-title">
        <h2 id="crafting-cart-title">Crafting list</h2>
        <div id="crafting-cart-content"><CraftingCart /></div>
      </section>
      <section id="quest-list-panel" class="quest-list-panel panel" aria-labelledby="quest-list-title">
        <h2 id="quest-list-title">Quest list</h2>
        <div id="quest-list"><QuestList /></div>
      </section>
    </aside>
  </div>
</template>
