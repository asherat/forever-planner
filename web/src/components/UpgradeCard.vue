<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { activeSpec, specPreset } from "../scoring.ts";
import { firstCraftSource, firstQuestSource, itemDungeons, itemReputationRequirement, meetsReputation, reputationRequirementText, sourcesForCharacter } from "../sources.ts";
import type { Candidate, Character, SlotDefinition, Snapshot } from "../types.ts";
import { hideItem, skipDungeon } from "../ui/not-interested.ts";
import { renderTick } from "../ui/render-tick.ts";
import { addToQuestList, isInQuestList } from "../ui/quest-list.ts";
import { comparisonTooltip, gainText, optionSubtitle, priceParts, routeBadge } from "../ui/upgrade-card.ts";
import ComparisonTooltip from "./ComparisonTooltip.vue";
import ItemIcon from "./ItemIcon.vue";
import MoneyAmount from "./MoneyAmount.vue";
import SourceLine from "./SourceLine.vue";
import WowheadLink from "./WowheadLink.vue";

const MAX_SOURCES_SHOWN = 2;

const props = defineProps<{ label: string; candidate: Candidate; character: Character; snapshot: Snapshot; slotDefinition: SlotDefinition }>();

const item = computed(function candidateItem() {
  return props.candidate.item;
});

const subtitle = computed(function cardSubtitle() {
  renderTick.value;
  return optionSubtitle(props.candidate, props.snapshot);
});

const tooltip = computed(function cardTooltip() {
  renderTick.value;
  return comparisonTooltip(props.slotDefinition, props.snapshot, props.character, props.candidate);
});

const gain = computed(function cardGain() {
  renderTick.value;
  return gainText(props.candidate, props.character);
});

const suffixNote = computed(function randomStatsNote() {
  if (!item.value.suffix) {
    return "";
  }
  return "Comes with random stats. Best for you: " + item.value.suffix.name + ".";
});

const badge = computed(function pathBadge() {
  renderTick.value;
  return routeBadge(props.candidate);
});

const reputationNote = computed(function reputationText() {
  renderTick.value;
  if (itemReputationRequirement(item.value, props.snapshot) === null || meetsReputation(item.value, props.snapshot)) {
    return "";
  }
  return reputationRequirementText(item.value, props.snapshot);
});

const sources = computed(function itemSources() {
  renderTick.value;
  return sourcesForCharacter(item.value, props.snapshot);
});

function sourceRow(source: (typeof sources.value)[number], index: number) {
  return { key: index, source: source };
}

const shownSources = computed(function sourcesShown() {
  return sources.value.slice(0, MAX_SOURCES_SHOWN).map(sourceRow);
});

const moreSources = computed(function hiddenSources() {
  if (sources.value.length <= MAX_SOURCES_SHOWN) {
    return "";
  }
  return "+" + (sources.value.length - MAX_SOURCES_SHOWN) + " more";
});

const craftSource = computed(function craftOf() {
  renderTick.value;
  return firstCraftSource(sources.value);
});

function pricePart(part: ReturnType<typeof priceParts>[number], index: number) {
  return { key: index, part: part, isMoney: part.kind === "money" };
}

const prices = computed(function priceLine() {
  renderTick.value;
  return priceParts(item.value, craftSource.value, props.snapshot, props.candidate.gain, specPreset(activeSpec(props.character)).unit).map(pricePart);
});

const questSource = computed(function questToAdd() {
  renderTick.value;
  const source = firstQuestSource(sources.value);
  if (source === null || source.questId === undefined || isInQuestList(props.character, source.questId)) {
    return null;
  }
  return source;
});

const dungeons = computed(function cardDungeons() {
  renderTick.value;
  return Array.from(itemDungeons(item.value, props.snapshot));
});

function addQuest(): void {
  if (questSource.value !== null && questSource.value.questId !== undefined) {
    addToQuestList(questSource.value.questId, item.value.id);
  }
}

function addToCraftingList(): void {
  addToCart(item.value.id);
}

function notInterested(): void {
  hideItem(item.value.id);
}

function skipperFor(dungeonName: string) {
  return {
    name: dungeonName,
    label: "Skip " + dungeonName,
    skip: function skipThisDungeon() {
      skipDungeon(dungeonName);
    }
  };
}

const skippers = computed(function dungeonSkippers() {
  renderTick.value;
  return dungeons.value.map(skipperFor);
});
</script>

<template>
  <div class="option">
    <div class="option-label">{{ label }}</div>
    <div class="option-heading" tabindex="0">
      <ItemIcon :item="item" size="icon-medium" />
      <div class="option-title">
        <WowheadLink :item="item" />
        <span class="muted">{{ subtitle }}</span>
      </div>
      <ComparisonTooltip :tooltip="tooltip" extra-class="tooltip-comparison" />
    </div>
    <div class="gains"><span :class="gain.className">{{ gain.text }}</span></div>
    <div v-if="suffixNote" class="option-note">{{ suffixNote }}</div>
    <div v-if="badge" :class="badge.className">{{ badge.text }}</div>
    <div v-if="reputationNote" class="option-requirement">{{ reputationNote }}</div>
    <ul class="sources">
      <SourceLine v-for="row in shownSources" :key="row.key" :source="row.source" />
      <li v-if="moreSources" class="muted">{{ moreSources }}</li>
    </ul>
    <div v-if="prices.length" class="option-price">
      <template v-for="price in prices" :key="price.key">
        <MoneyAmount v-if="price.isMoney" :copper="price.part.copper" />
        <template v-else>{{ price.part.text }}</template>
      </template>
    </div>
    <div class="option-actions">
      <button v-if="questSource" type="button" class="link" @click="addQuest">Add quest</button>
      <button v-if="craftSource" type="button" class="link" @click="addToCraftingList">Add to crafting list</button>
      <button type="button" class="link" @click="notInterested">Not interested</button>
      <button v-for="skipper in skippers" :key="skipper.name" type="button" class="link" @click="skipper.skip">{{ skipper.label }}</button>
    </div>
  </div>
</template>
