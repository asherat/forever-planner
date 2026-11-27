<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { isEmptyLeg, MAX_CHARACTER_LEVEL, nextZoneSuggestions, routeEditor, routeEndLevel, routeLegs } from "../route.ts";
import type { Character, GuideZone, RouteLeg, Snapshot } from "../types.ts";
import { renderTick } from "../ui/render-tick.ts";
import { toggleAllZones } from "../ui/route-actions.ts";
import EmptyLevels from "./EmptyLevels.vue";
import GapResolver from "./GapResolver.vue";
import RouteLegView from "./RouteLeg.vue";
import ZoneChoice from "./ZoneChoice.vue";

const SUGGESTED_READY_ZONES = 4;
const SUGGESTED_LATER_ZONES = 2;

interface PanelState {
  character: Character;
  snapshot: Snapshot;
}

interface LegRow {
  key: string;
  leg: RouteLeg;
  index: number;
  isEmpty: boolean;
  nextZone: string;
}

const panel = computed(function currentCharacter(): PanelState | null {
  renderTick.value;
  const character = selectedCharacter();
  if (character === null || !state.snapshots[character.slug]) {
    return null;
  }
  return { character: character, snapshot: state.snapshots[character.slug] };
});

const legs = computed(function panelLegs(): RouteLeg[] {
  if (panel.value === null) {
    return [];
  }
  return routeLegs(panel.value.character, panel.value.snapshot);
});

function legRow(leg: RouteLeg, index: number, all: RouteLeg[]): LegRow {
  let nextZone = "";
  if (index + 1 < all.length && all[index + 1].zone !== null) {
    nextZone = String(all[index + 1].zone);
  }
  return { key: index + "-" + leg.zone, leg: leg, index: index, isEmpty: isEmptyLeg(leg), nextZone: nextZone };
}

const rows = computed(function legRows() {
  return legs.value.map(legRow);
});

const pendingGap = computed(function gap() {
  renderTick.value;
  return routeEditor.pendingGap;
});

const endLevel = computed(function pathEnd() {
  if (panel.value === null) {
    return 0;
  }
  return routeEndLevel(panel.value.character, panel.value.snapshot);
});

const pathStatus = computed(function statusOfPath() {
  if (endLevel.value < MAX_CHARACTER_LEVEL) {
    return "open";
  }
  if (legs.value.some(isEmptyLeg)) {
    return "empty-levels";
  }
  return "done";
});

const hasEmptyLevels = computed(function emptyLevelsLeft() {
  return pathStatus.value === "empty-levels";
});

const isDone = computed(function pathDone() {
  return pathStatus.value === "done";
});

const question = computed(function nextQuestion() {
  if (legs.value.length === 0) {
    return "Where are you leveling now?";
  }
  return "From level " + endLevel.value + ", where next?";
});

const suggestions = computed(function zoneSuggestions(): { ready: GuideZone[]; later: GuideZone[] } {
  if (panel.value === null) {
    return { ready: [], later: [] };
  }
  let previousZone: string | null = null;
  if (legs.value.length > 0) {
    previousZone = legs.value[legs.value.length - 1].zone;
  }
  return nextZoneSuggestions(endLevel.value, panel.value.snapshot.factionType, previousZone);
});

const showAll = computed(function allZonesShown() {
  renderTick.value;
  return routeEditor.showAllZones;
});

const readyZones = computed(function shownReady() {
  if (showAll.value) {
    return suggestions.value.ready;
  }
  return suggestions.value.ready.slice(0, SUGGESTED_READY_ZONES);
});

const laterZones = computed(function shownLater() {
  if (showAll.value) {
    return suggestions.value.later;
  }
  return suggestions.value.later.slice(0, SUGGESTED_LATER_ZONES);
});

function readyLabel(zone: GuideZone): string {
  return zone.minLevel + "–" + zone.maxLevel;
}

function laterLabel(zone: GuideZone): string {
  return "starts at " + zone.minLevel;
}

const readyChoices = computed(function readyWithLabels() {
  return readyZones.value.map(function withReadyLabel(zone) {
    return { zone: zone, label: readyLabel(zone) };
  });
});

const laterChoices = computed(function laterWithLabels() {
  return laterZones.value.map(function withLaterLabel(zone) {
    return { zone: zone, label: laterLabel(zone) };
  });
});

const hiddenCount = computed(function hiddenZones() {
  return suggestions.value.ready.length + suggestions.value.later.length - readyZones.value.length - laterZones.value.length;
});

const toggleText = computed(function toggleLabel() {
  if (showAll.value) {
    return "Show fewer zones";
  }
  return "Show all zones (" + hiddenCount.value + " more)";
});

const showToggle = computed(function toggleShown() {
  return hiddenCount.value > 0 || showAll.value;
});
</script>

<template>
  <template v-if="panel">
    <ol v-if="rows.length" class="route-legs">
      <template v-for="row in rows" :key="row.key">
        <EmptyLevels v-if="row.isEmpty" :leg="row.leg" :index="row.index" :next-zone="row.nextZone" :snapshot="panel.snapshot" />
        <RouteLegView v-else :leg="row.leg" :index="row.index" :snapshot="panel.snapshot" />
      </template>
    </ol>
    <GapResolver v-if="pendingGap" :gap="pendingGap" :legs="legs" :snapshot="panel.snapshot" />
    <p v-else-if="hasEmptyLevels" class="route-warning">Your path has empty levels. Choose where to level for them above.</p>
    <p v-else-if="isDone" class="route-done">Your path reaches level 60.</p>
    <template v-else>
      <h3 class="route-question">{{ question }}</h3>
      <div class="zone-choices">
        <ZoneChoice v-for="choice in readyChoices" :key="choice.zone.name" :zone="choice.zone" :label="choice.label" />
        <div v-if="laterChoices.length" class="zone-separator">Needs a filler zone first</div>
        <ZoneChoice v-for="choice in laterChoices" :key="choice.zone.name" :zone="choice.zone" :label="choice.label" />
      </div>
      <button v-if="showToggle" type="button" class="link" @click="toggleAllZones">{{ toggleText }}</button>
    </template>
  </template>
</template>
