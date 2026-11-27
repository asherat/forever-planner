import "./legacy.ts";
import type { Character, Settings } from "./types.ts";

export function clampedLookahead(value: unknown): number {
  const levels = Math.round(Number(value));
  if (!(levels >= 0)) {
    return DEFAULT_LOOKAHEAD_LEVELS;
  }
  return Math.min(MAX_LOOKAHEAD_LEVELS, levels);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function validatedCharacter(candidate: unknown): Character | null {
  if (!isObject(candidate) || typeof candidate.slug !== "string" || typeof candidate.displayName !== "string") {
    return null;
  }
  const character = candidate as Character;
  if (!Array.isArray(character.hiddenItemIds)) {
    character.hiddenItemIds = [];
  }
  if (!Array.isArray(character.skippedDungeons)) {
    character.skippedDungeons = [];
  }
  if (character.maxGoldPerUpgrade !== undefined && character.maxGoldPerUpgrade !== null && !(Number(character.maxGoldPerUpgrade) >= 0)) {
    character.maxGoldPerUpgrade = null;
  }
  return character;
}

export function validatedSettings(imported: unknown): Settings | null {
  if (!isObject(imported) || !Array.isArray(imported.characters)) {
    return null;
  }
  const settings = defaultSettings();
  if (REGIONS.indexOf(imported.region as string) !== -1) {
    settings.region = imported.region as string;
  }
  settings.lookaheadLevels = clampedLookahead(imported.lookaheadLevels);
  for (const candidate of imported.characters) {
    const character = validatedCharacter(candidate);
    if (character === null) {
      return null;
    }
    settings.characters.push(character);
  }
  for (const character of settings.characters) {
    if (character.slug === imported.selectedCharacterSlug) {
      settings.selectedCharacterSlug = character.slug;
    }
  }
  if (settings.selectedCharacterSlug === null && settings.characters.length > 0) {
    settings.selectedCharacterSlug = settings.characters[0].slug;
  }
  return settings;
}
