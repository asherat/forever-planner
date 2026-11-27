import test from "node:test";
import assert from "node:assert/strict";
import { computed, isReactive } from "vue";
import { resetPlanner } from "./helpers/realm.mjs";
import { state } from "../web/src/state.ts";

test("game data stays raw in the store but still updates what reads it", () => {
  resetPlanner();
  let runs = 0;
  const itemCount = computed(function countItems() {
    runs += 1;
    if (state.questie === null) {
      return 0;
    }
    return Object.keys(state.questie.items).length;
  });
  assert.equal(itemCount.value, 0);
  const questie = { items: { 1: { sources: [] }, 2: { sources: [] } } };
  state.questie = questie;
  assert.equal(itemCount.value, 2);
  assert.equal(state.questie, questie);
  assert.equal(isReactive(state.questie), false);
  state.tsm = { prices: {} };
  state.upgradeOptions = [{ priority: 1 }];
  assert.equal(isReactive(state.tsm), false);
  assert.equal(isReactive(state.upgradeOptions), false);
  assert.equal(runs, 2);
});

test("settings stay deeply reactive, so edits in place update what reads them", () => {
  const { character } = resetPlanner();
  const hiddenCount = computed(function countHidden() {
    return state.settings.characters[0].hiddenItemIds.length;
  });
  assert.equal(hiddenCount.value, 0);
  state.settings.characters[0].hiddenItemIds.push(7);
  assert.equal(hiddenCount.value, 1);
  assert.equal(character.slug, state.settings.characters[0].slug);
});

test("answers profession questions about a character's snapshot", async () => {
  const { knowsRecipe, professionOf, snapshotOf } = await import("../web/src/state.ts");
  const { character, snapshot } = resetPlanner();
  snapshot.professions = [{ name: "Tailoring", skillPoints: 120, recipeIds: [2359] }];
  assert.deepEqual(snapshotOf(character), snapshot);
  assert.equal(snapshotOf(null), null);
  assert.equal(professionOf(snapshot, "Tailoring").skillPoints, 120);
  assert.equal(professionOf(snapshot, "Alchemy"), null);
  assert.equal(knowsRecipe(snapshot, "Tailoring", 2359), true);
  assert.equal(knowsRecipe(snapshot, "Tailoring", 1), false);
  assert.equal(knowsRecipe(snapshot, "Alchemy", 2359), false);
});
