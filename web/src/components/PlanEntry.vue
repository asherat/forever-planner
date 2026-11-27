<script setup lang="ts">
import { computed } from "vue";
import type { Snapshot } from "../types.ts";
import { removePick } from "../ui/gear-plan.ts";
import type { PlanEntry } from "../ui/gear-plan.ts";
import ItemIcon from "./ItemIcon.vue";
import MoneyAmount from "./MoneyAmount.vue";
import QuestSteps from "./QuestSteps.vue";
import SourceLine from "./SourceLine.vue";
import WowheadLink from "./WowheadLink.vue";

const props = defineProps<{ entry: PlanEntry; snapshot: Snapshot }>();

const quest = computed(function questView() {
  const source = props.entry.source;
  if (props.entry.kind !== "quest" || source === null || source.questId === undefined) {
    return null;
  }
  return { questId: source.questId as number, name: String(source.quest) };
});

const sourceLine = computed(function placedSource() {
  if (props.entry.kind === "owned" || props.entry.kind === "drop" || props.entry.kind === "vendor") {
    return props.entry.source;
  }
  return null;
});

const priceLabel = computed(function priceText() {
  if (props.entry.kind === "auction") {
    return "Auction house: ";
  }
  if (props.entry.kind === "craft") {
    return "Craft it, materials about ";
  }
  if (props.entry.kind === "vendor") {
    return "Price: ";
  }
  return "";
});

const hasPrice = computed(function priceKnown() {
  return props.entry.price !== null;
});

const price = computed(function priceValue() {
  return props.entry.price || 0;
});

const slotText = computed(function slotLabel() {
  return " · " + props.entry.slotLabel;
});

const unknownText = computed(function noSourceText() {
  if (props.entry.kind === "craft" && props.entry.price === null) {
    return "Craft it (material prices unknown)";
  }
  if (props.entry.kind === "unknown") {
    return "No known way to get it right now";
  }
  return "";
});

const removeLabel = computed(function removeText() {
  return "Remove " + props.entry.item.name + " from your plan";
});

function remove(): void {
  removePick(props.entry.slotKey, props.entry.item);
}
</script>

<template>
  <li class="plan-entry">
    <div class="plan-entry-header">
      <ItemIcon :item="entry.item" size="icon-small" />
      <span class="plan-entry-name"><WowheadLink :item="entry.item" /><span class="muted">{{ slotText }}</span></span>
      <button type="button" class="cart-remove" :aria-label="removeLabel" @click="remove">×</button>
    </div>
    <QuestSteps v-if="quest" :quest-id="quest.questId" :quest-name="quest.name" :snapshot="snapshot" />
    <ul v-else-if="sourceLine" class="sources"><SourceLine :source="sourceLine" /></ul>
    <div v-if="hasPrice" class="plan-entry-price">{{ priceLabel }}<MoneyAmount :copper="price" />{{ entry.priceNote }}</div>
    <div v-if="unknownText" class="muted">{{ unknownText }}</div>
  </li>
</template>
