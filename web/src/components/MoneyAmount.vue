<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { formatMoney } from "../prices.ts";

const props = defineProps<{ copper: number }>();

interface Coin {
  coin: string;
  value: number;
  classes: string;
}

const rounded = computed(function roundedCopper() {
  return Math.round(props.copper);
});

const coins = computed(function shownCoins() {
  const amounts = [
    { value: Math.floor(rounded.value / 10000), coin: "gold" },
    { value: Math.floor((rounded.value % 10000) / 100), coin: "silver" },
    { value: rounded.value % 100, coin: "copper" }
  ];
  const shown: Coin[] = [];
  for (const amount of amounts) {
    if (amount.value === 0 && !(amount.coin === "copper" && shown.length === 0)) {
      continue;
    }
    shown.push({ coin: amount.coin, value: amount.value, classes: "coin coin-" + amount.coin });
  }
  return shown;
});

const spoken = computed(function readableMoney() {
  return formatMoney(rounded.value);
});
</script>

<template>
  <span class="money"><span v-for="part in coins" :key="part.coin" class="money-part" aria-hidden="true">{{ part.value }}<span :class="part.classes"></span></span><span class="visually-hidden">{{ spoken }}</span></span>
</template>
