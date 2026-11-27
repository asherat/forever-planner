<script setup lang="ts">
import { computed } from "vue";
import "../legacy.ts";
import { renderTick } from "../ui/render-tick.ts";
import { changeGoldLimit, chooseFeralForm, chooseGearFor, choosePlaystyle, feralFormGroup, gearForGroup, goldLimitText, playstyleGroup } from "../ui/play-controls.ts";
import ChoiceGroup from "./ChoiceGroup.vue";
import { selectedCharacter, state } from "../state.ts";

const view = computed(function controlsView() {
  renderTick.value;
  const character = selectedCharacter();
  if (character === null || !state.snapshots[character.slug]) {
    return null;
  }
  const snapshot = state.snapshots[character.slug];
  return {
    playstyle: playstyleGroup(character, snapshot),
    goldLimit: goldLimitText(character),
    gearFor: gearForGroup(character, snapshot),
    feralForm: feralFormGroup(character, snapshot)
  };
});

function goldLimitChanged(event: Event): void {
  changeGoldLimit((event.target as HTMLInputElement).value);
}
</script>

<template>
  <template v-if="view">
    <fieldset class="choice-group">
      <legend>Where do you play most?</legend>
      <div id="playstyle-choices" class="choices"><ChoiceGroup name="playstyle" :group="view.playstyle" @choose="choosePlaystyle" /></div>
    </fieldset>
    <fieldset class="choice-group">
      <legend>Max gold per upgrade</legend>
      <label class="gold-limit">
        <input id="gold-limit" name="gold-limit" type="number" min="0" step="1" inputmode="numeric" placeholder="No limit" aria-label="Max gold per upgrade" :value="view.goldLimit" @change="goldLimitChanged">
        <span>g</span>
      </label>
    </fieldset>
    <fieldset v-if="view.gearFor" id="gear-for" class="choice-group">
      <legend>Gear for</legend>
      <div id="gear-for-choices" class="choices"><ChoiceGroup name="gear-for" :group="view.gearFor" @choose="chooseGearFor" /></div>
    </fieldset>
    <fieldset v-if="view.feralForm" id="feral-form" class="choice-group">
      <legend>Feral form</legend>
      <div id="feral-form-choices" class="choices"><ChoiceGroup name="feral-form" :group="view.feralForm" @choose="chooseFeralForm" /></div>
    </fieldset>
  </template>
</template>
