import "../legacy.ts";
import { dungeonForArea, guideZone, isRouteActive, legForSource } from "../route.ts";
import { CLASS_BITS, completedQuests, equippedItemIds, itemById, itemName, sourcesForCharacter } from "../sources.ts";
import type { Character, Snapshot } from "../types.ts";
import type { ChainStep, Place } from "../questie.ts";
import { saveSettings, selectedCharacter, setStatus, state } from "../state.ts";
import { render } from "../gear.ts";

export interface QuestListEntry {
  questId: number;
  itemId: number;
}

export function characterQuestList(character: Character): QuestListEntry[] {
  if (!Array.isArray(character.questList)) {
    character.questList = [];
  }
  return character.questList as QuestListEntry[];
}

export function isInQuestList(character: Character, questId: number): boolean {
  for (const entry of characterQuestList(character)) {
    if (entry.questId === questId) {
      return true;
    }
  }
  return false;
}

export function addToQuestList(questId: number, itemId: number): void {
  const character = selectedCharacter();
  if (character === null || isInQuestList(character, questId)) {
    return;
  }
  characterQuestList(character).push({ questId: questId, itemId: itemId });
  saveSettings();
  render();
}

export function questUpgradesMissing(character: Character): QuestListEntry[] {
  const missing: QuestListEntry[] = [];
  for (const pick of (state.questUpgradePicks || []) as QuestListEntry[]) {
    if (!isInQuestList(character, pick.questId)) {
      missing.push(pick);
    }
  }
  return missing;
}

export function addQuestUpgrades(): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  for (const pick of questUpgradesMissing(character)) {
    characterQuestList(character).push({ questId: pick.questId, itemId: pick.itemId });
  }
  saveSettings();
  render();
}

export function clearQuestList(): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  character.questList = [];
  saveSettings();
  render();
}

function isOtherQuest(this: number, entry: QuestListEntry): boolean {
  return entry.questId !== this;
}

export function removeFromQuestList(questId: number): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  character.questList = characterQuestList(character).filter(isOtherQuest, questId);
  saveSettings();
  render();
}

export function pruneQuestList(character: Character, snapshot: Snapshot): string[] {
  const equipped = equippedItemIds(snapshot);
  const completed = completedQuests(snapshot);
  const kept: QuestListEntry[] = [];
  const removedNames: string[] = [];
  for (const entry of characterQuestList(character)) {
    if (completed.has(entry.questId) || equipped.has(entry.itemId)) {
      removedNames.push(itemName(entry.itemId));
    } else {
      kept.push(entry);
    }
  }
  character.questList = kept;
  saveSettings();
  return removedNames;
}

export function isChainStepForCharacter(step: ChainStep, snapshot: Snapshot): boolean {
  if (step.faction !== null && step.faction !== snapshot.factionType) {
    return false;
  }
  const classBit = CLASS_BITS[snapshot.className];
  return !step.classes || !classBit || Boolean(step.classes & classBit);
}

export function offPathZone(entry: QuestListEntry, character: Character, snapshot: Snapshot): string | null {
  const item = itemById(entry.itemId);
  if (!isRouteActive(character) || item === null) {
    return null;
  }
  for (const source of sourcesForCharacter(item, snapshot)) {
    if (source.type === "quest" && source.questId === entry.questId) {
      if ((guideZone(source.zone) !== null || dungeonForArea(source.zone) !== null) && legForSource(character, snapshot, source) === null) {
        return source.zone || null;
      }
      return null;
    }
  }
  return null;
}

export function completedStepCount(steps: ChainStep[], completed: Set<number>): number {
  let count = 0;
  for (const step of steps) {
    if (completed.has(step.id)) {
      count += 1;
    }
  }
  return count;
}

export function waypointText(place: Place): string {
  if (place.x === null || place.y === null) {
    return "";
  }
  return "/way " + place.zone + " " + place.x.toFixed(1) + " " + place.y.toFixed(1);
}

export async function copyWaypoint(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied \"" + text + "\". Paste it in the game chat.", "success");
  } catch {
    setStatus(text, "info");
  }
}
