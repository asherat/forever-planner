<script setup lang="ts">
import { computed } from "vue";
import type { Plan } from "../crafting-plan.ts";
import { changeQuantity, planRequirements, planVerdict, removeEntry } from "../ui/crafting-page.ts";
import CraftingItemLabel from "./CraftingItemLabel.vue";
import MoneyAmount from "./MoneyAmount.vue";
import MoneyOrUnknown from "./MoneyOrUnknown.vue";
import PlanTreeNode from "./PlanTreeNode.vue";

const props = defineProps<{ plan: Plan; index: number }>();

const quantityId = computed(function quantityInputId() {
  return "crafting-quantity-" + props.index;
});

const quantity = computed(function quantityText() {
  return String(props.plan.entry.quantity);
});

const verdict = computed(function verdictView() {
  const view = planVerdict(props.plan);
  return {
    isForSale: view.readyMade !== null,
    readyMade: view.readyMade || 0,
    hasSaving: view.saving > 0,
    saving: view.saving,
    hasLoss: view.loss > 0,
    loss: view.loss
  };
});

const requirements = computed(function requirementsView() {
  return planRequirements(props.plan);
});

function quantityChanged(event: Event): void {
  changeQuantity(props.index, (event.target as HTMLInputElement).value);
}

</script>

<template>
  <li class="crafting-entry panel">
    <div class="crafting-entry-header">
      <h3 class="crafting-entry-title"><CraftingItemLabel :item-id="plan.entry.itemId" /></h3>
      <input :id="quantityId" class="crafting-quantity" type="number" min="1" :value="quantity" aria-label="How many" @change="quantityChanged">
      <button class="link" type="button" @click="removeEntry(index)">Remove</button>
    </div>
    <p class="crafting-verdict">{{ "Your plan costs " }}<MoneyOrUnknown :copper="plan.root.cost" :missing="plan.root.missingPrice" /><template v-if="verdict.isForSale">{{ " · ready-made " }}<MoneyAmount :copper="verdict.readyMade" /></template><template v-else>{{ ". Not for sale ready-made right now." }}</template><template v-if="verdict.hasSaving">{{ " · " }}<strong class="verdict-good">{{ "Crafting saves " }}<MoneyAmount :copper="verdict.saving" /></strong></template><template v-if="verdict.hasLoss">{{ " · " }}<strong class="verdict-bad">{{ "Buying it is cheaper by " }}<MoneyAmount :copper="verdict.loss" /></strong></template></p>
    <ul class="requirements">
      <li v-for="requirement in requirements.recipes" :key="requirement.key" class="requirement">{{ requirement.profession }}<CraftingItemLabel :item-id="requirement.itemId" /><span v-if="requirement.knownBy" class="requirement-met">{{ " known by " + requirement.knownBy }}</span><template v-else><span class="requirement-missing">{{ " none of your characters knows it yet" }}</span><div v-if="requirement.source" class="recipe-source"><template v-if="requirement.source.text">{{ requirement.source.text }}</template><div v-for="line in requirement.source.lines" :key="line.key" :class="line.classes" tabindex="0" v-bind="line.mapAttributes">{{ line.prefix }}<a v-if="line.npcUrl" class="wowhead-link" :href="line.npcUrl" target="_blank" rel="noopener">{{ line.npcName }}</a>{{ line.suffix }}{{ line.coordinates }}</div></div></template></li>
      <li v-for="requirement in requirements.bindOnPickup" :key="requirement.key" class="requirement"><CraftingItemLabel :item-id="requirement.itemId" /><span class="requirement-missing">{{ requirement.text }}</span></li>
      <li v-if="requirements.craftedIsBindOnPickup" class="requirement muted">Bind on pickup: the character who crafts it keeps it.</li>
    </ul>
    <ul class="tree">
      <PlanTreeNode :node="plan.root" />
    </ul>
  </li>
</template>
