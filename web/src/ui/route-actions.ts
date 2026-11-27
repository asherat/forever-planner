import "../legacy.ts";
import { chooseZone, fillEmptyLevels, removeLeg, resolveGap, routeEditor, startNextZoneEarlier, updateLegEnd } from "../route.ts";
import type { Character, Snapshot } from "../types.ts";

function withCharacter(change: (character: Character, snapshot: Snapshot) => void): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  change(character, state.snapshots[character.slug]);
  saveSettings();
  render();
}

export function pickZone(zoneName: string): void {
  withCharacter(function addZone(character, snapshot) {
    chooseZone(character, snapshot, zoneName);
    routeEditor.showAllZones = false;
  });
}

export function closeGap(resolution: string, fillerZone: string | undefined): void {
  withCharacter(function closeTheGap(character, snapshot) {
    resolveGap(character, snapshot, resolution, fillerZone);
  });
}

export function cancelGap(): void {
  routeEditor.pendingGap = null;
  render();
}

export function toggleAllZones(): void {
  routeEditor.showAllZones = !routeEditor.showAllZones;
  render();
}

export function removeZone(index: number): void {
  withCharacter(function removeTheZone(character) {
    removeLeg(character, index);
  });
}

export function fillLevels(index: number, zoneName: string): void {
  withCharacter(function fillTheLevels(character) {
    fillEmptyLevels(character, index, zoneName);
  });
}

export function startEarlier(index: number): void {
  withCharacter(function startTheNextZone(character) {
    startNextZoneEarlier(character, index);
  });
}

export function changeLegEnd(index: number, value: string): void {
  withCharacter(function changeTheEnd(character, snapshot) {
    updateLegEnd(character, snapshot, index, value);
  });
}
