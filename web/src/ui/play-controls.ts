import "../legacy.ts";
import { characterPlaystyle, characterSpecs, hasFeralSpec, isPvpRuleset, specLabel } from "../scoring.ts";
import type { Character, Snapshot } from "../types.ts";
import { saveSettings, selectedCharacter } from "../state.ts";

export interface Choice {
  value: string;
  label: string;
}

export interface ChoiceGroupView {
  choices: Choice[];
  selected: string;
}

export function playstyleGroup(character: Character, snapshot: Snapshot): ChoiceGroupView {
  const choices: Choice[] = [];
  for (const playstyleKey of Object.keys(window.GAME_RULES.playstyles)) {
    const playstyle = window.GAME_RULES.playstyles[playstyleKey];
    let label = playstyle.label;
    if (playstyle.pvpRulesetLabel && isPvpRuleset(snapshot)) {
      label = playstyle.pvpRulesetLabel;
    }
    choices.push({ value: playstyleKey, label: label });
  }
  return { choices: choices, selected: characterPlaystyle(character) };
}

export function gearForGroup(character: Character, snapshot: Snapshot): ChoiceGroupView | null {
  const specs = characterSpecs(character, snapshot);
  if (specs.length < 2) {
    return null;
  }
  let selected = "main";
  if (character.gearFor === "off") {
    selected = "off";
  }
  return { choices: [{ value: "main", label: "Main: " + specLabel(specs[0]) }, { value: "off", label: "Off: " + specLabel(specs[1]) }], selected: selected };
}

export function feralFormGroup(character: Character, snapshot: Snapshot): ChoiceGroupView | null {
  if (!hasFeralSpec(snapshot)) {
    return null;
  }
  let selected = "cat";
  if (character.feralForm === "bear") {
    selected = "bear";
  }
  return { choices: [{ value: "cat", label: "Cat" }, { value: "bear", label: "Bear" }], selected: selected };
}

export function goldLimitText(character: Character): string {
  if (character.maxGoldPerUpgrade === undefined || character.maxGoldPerUpgrade === null) {
    return "";
  }
  return String(character.maxGoldPerUpgrade);
}

export function goldLimitFromInput(value: string): number | null {
  const gold = Number(value);
  if (value.trim() === "" || !Number.isFinite(gold) || gold < 0) {
    return null;
  }
  return gold;
}

function applyChoice(change: (character: Character) => void): void {
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  change(character);
  saveSettings();
  render();
}

export function choosePlaystyle(value: string): void {
  applyChoice(function setPlaystyle(character) {
    character.playstyle = value;
  });
}

export function chooseGearFor(value: string): void {
  applyChoice(function setGearFor(character) {
    character.gearFor = value;
  });
}

export function chooseFeralForm(value: string): void {
  applyChoice(function setFeralForm(character) {
    character.feralForm = value;
  });
}

export function changeGoldLimit(value: string): void {
  applyChoice(function setGoldLimit(character) {
    character.maxGoldPerUpgrade = goldLimitFromInput(value);
  });
}
