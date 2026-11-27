<script setup lang="ts">
import { COMPARED_RANGES } from "../ui/profession-page.ts";
import type { ComparisonRow } from "../ui/profession-page.ts";
import MoneyAmount from "./MoneyAmount.vue";

defineProps<{ rows: ComparisonRow[] }>();
const emit = defineEmits<{ choose: [profession: string] }>();

function chosen(profession: string): void {
  emit("choose", profession);
}
</script>

<template>
  <section class="panel guide-comparison">
    <h2>What each profession costs to level</h2>
    <p class="muted">From scratch, with today's prices and what this character can craft. Cheapest to 300 first.</p>
    <div class="guide-comparison-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Profession</th>
            <th v-for="range in COMPARED_RANGES" :key="range" scope="col">{{ range }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key">
            <th scope="row"><button type="button" class="link" @click="chosen(row.name)">{{ row.name }}</button><span v-if="row.note" class="muted guide-comparison-note">{{ row.note }}</span></th>
            <td v-for="cell in row.cells" :key="cell.key">
              <MoneyAmount v-if="cell.hasCost" :copper="cell.copper" />
              <span v-else class="muted">no prices</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
