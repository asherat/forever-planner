import { ref } from "vue";
import "../legacy.ts";
import { itemById, itemName } from "../sources.ts";
import type { Character, Snapshot } from "../types.ts";
import { dungeonHasUpgrades, isUpgradeForAnySpec } from "../upgrades.ts";
import { saveSettings, selectedCharacter, state } from "../state.ts";
import { render } from "../gear.ts";

export interface UndoAction {
  kind: "item" | "dungeon";
  itemId: number;
  dungeonName: string;
  text: string;
}

export const lastHidden = ref<UndoAction | null>(null);

function rememberUndo(action: UndoAction): void {
  lastHidden.value = action;
}

export function hideItem(itemId: number): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  if (!character.hiddenItemIds) {
    character.hiddenItemIds = [];
  }
  if (character.hiddenItemIds.indexOf(itemId) === -1) {
    character.hiddenItemIds.push(itemId);
    saveSettings();
  }
  rememberUndo({ kind: "item", itemId: itemId, dungeonName: "", text: "Hid " + itemName(itemId) + "." });
  render();
}

export function skipDungeon(dungeonName: string): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  if (!character.skippedDungeons) {
    character.skippedDungeons = [];
  }
  if (character.skippedDungeons.indexOf(dungeonName) === -1) {
    character.skippedDungeons.push(dungeonName);
    saveSettings();
  }
  rememberUndo({ kind: "dungeon", itemId: 0, dungeonName: dungeonName, text: "Skipped " + dungeonName + ": its drops and quests no longer count." });
  render();
}

function isOtherValue<Value>(this: Value, value: Value): boolean {
  return value !== this;
}

export function restoreItem(itemId: number): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  character.hiddenItemIds = (character.hiddenItemIds || []).filter(isOtherValue, itemId);
  saveSettings();
  render();
}

export function restoreDungeon(dungeonName: string): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  character.skippedDungeons = (character.skippedDungeons || []).filter(isOtherValue, dungeonName);
  saveSettings();
  render();
}

export function undoLastHide(): void {
  const undo = lastHidden.value;
  lastHidden.value = null;
  if (undo === null) {
    return;
  }
  if (undo.kind === "item") {
    restoreItem(undo.itemId);
  } else {
    restoreDungeon(undo.dungeonName);
  }
}

export function pruneNotInterested(character: Character, snapshot: Snapshot): string[] {
  const removedNames: string[] = [];
  const keptItems: number[] = [];
  for (const itemId of character.hiddenItemIds || []) {
    const item = itemById(itemId);
    if (item !== null && isUpgradeForAnySpec(item, character, snapshot)) {
      keptItems.push(itemId);
    } else {
      removedNames.push(itemName(itemId));
    }
  }
  const keptDungeons: string[] = [];
  for (const dungeonName of character.skippedDungeons || []) {
    if (state.questie === null || dungeonHasUpgrades(dungeonName, character, snapshot)) {
      keptDungeons.push(dungeonName);
    } else {
      removedNames.push(dungeonName);
    }
  }
  character.hiddenItemIds = keptItems;
  character.skippedDungeons = keptDungeons;
  saveSettings();
  return removedNames;
}
