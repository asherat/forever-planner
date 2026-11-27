import { ref } from "vue";
import "../legacy.ts";
import { itemName } from "../sources.ts";

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
