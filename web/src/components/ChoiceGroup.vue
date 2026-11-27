<script setup lang="ts">
import { computed } from "vue";
import type { ChoiceGroupView } from "../ui/play-controls.ts";

const props = defineProps<{ name: string; group: ChoiceGroupView }>();
const emit = defineEmits<{ choose: [value: string] }>();

const choices = computed(function choiceRows() {
  return props.group.choices.map(function withState(choice) {
    return { value: choice.value, label: choice.label, checked: choice.value === props.group.selected };
  });
});

function choose(event: Event): void {
  emit("choose", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <label v-for="choice in choices" :key="choice.value" class="choice"><input type="radio" :name="name" :value="choice.value" :checked="choice.checked" @change="choose"><span>{{ choice.label }}</span></label>
</template>
