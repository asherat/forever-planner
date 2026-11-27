<script setup lang="ts">
import { computed } from "vue";
import type { PlanNode } from "../crafting-plan.ts";
import { chooseMode, modeChoices, nodeExplanation } from "../ui/crafting-page.ts";
import CraftingItemLabel from "./CraftingItemLabel.vue";
import MoneyAmount from "./MoneyAmount.vue";
import MoneyOrUnknown from "./MoneyOrUnknown.vue";

const props = defineProps<{ node: PlanNode }>();

const choices = computed(function nodeChoices() {
  return modeChoices(props.node);
});

const quantity = computed(function quantityText() {
  return "×" + props.node.quantity;
});

const explanation = computed(function explanationText() {
  return nodeExplanation(props.node);
});

const hasChildren = computed(function anyChildren() {
  return props.node.children.length > 0;
});

const children = computed(function childRows() {
  return props.node.children.map(function rowOf(child, index) {
    return { key: index + ":" + child.itemId, node: child };
  });
});
</script>

<template>
  <li class="tree-node">
    <div class="tree-row">
      <span class="tree-name"><CraftingItemLabel :item-id="node.itemId" /><span class="tree-quantity">{{ quantity }}</span></span>
      <span class="mode-buttons"><button v-for="choice in choices" :key="choice.mode" class="mode-button" type="button" :aria-pressed="choice.pressed" @click="chooseMode(node.itemId, choice.mode)"><svg viewBox="0 0 24 24" class="mode-icon" aria-hidden="true"><path :d="choice.iconPath" /></svg>{{ choice.label }}<span class="mode-value"><MoneyAmount v-if="choice.showsMoney" :copper="choice.copper" /><template v-else>{{ choice.text }}</template></span></button></span>
      <MoneyOrUnknown :copper="node.cost" :missing="node.missingPrice" />
    </div>
    <div class="tree-explanation muted">{{ explanation }}</div>
    <ul v-if="hasChildren" class="tree-children">
      <PlanTreeNode v-for="child in children" :key="child.key" :node="child.node" />
    </ul>
  </li>
</template>
