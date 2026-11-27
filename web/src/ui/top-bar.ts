import { ref } from "vue";
import "../legacy.ts";
import { routeEditor } from "../route.ts";
import { pruneNotInterested } from "./not-interested.ts";
import { pruneGearPlan } from "./gear-plan.ts";
import { readWowFolder } from "../folder-data.ts";
import { saveSettings, selectedCharacter, setStatus, state } from "../state.ts";
import { handleTsmStartupError, render } from "../gear.ts";
import { refreshCharacter } from "../profile.ts";

export const isRefreshing = ref(false);

export interface CharacterOption {
  slug: string;
  name: string;
}

export function characterOptions(): CharacterOption[] {
  return state.settings.characters.map(function optionOf(character) {
    return { slug: character.slug, name: character.displayName };
  });
}

export function selectCharacter(slug: string): void {
  state.settings.selectedCharacterSlug = slug;
  routeEditor.pendingGap = null;
  saveSettings();
  render();
  readWowFolder(false).then(render).catch(handleTsmStartupError);
}

function refreshMessage(removedNames: string[], outgrownNames: string[]): string | null {
  const messages: string[] = [];
  if (removedNames.length > 0) {
    messages.push("Removed from your lists because you finished or equipped them: " + Array.from(new Set(removedNames)).join(", ") + ".");
  }
  if (outgrownNames.length > 0) {
    messages.push("No longer upgrades, so dropped from your not-interested list: " + outgrownNames.join(", ") + ".");
  }
  if (messages.length === 0) {
    return null;
  }
  return "Updated. " + messages.join(" ");
}

export async function refreshSelectedCharacter(): Promise<void> {
  const character = selectedCharacter();
  if (character === null) {
    setStatus("Add a character in Settings first.", "error");
    return;
  }
  isRefreshing.value = true;
  try {
    await refreshCharacter(character);
    await readWowFolder(true);
    const snapshot = state.snapshots[character.slug];
    const removedNames = pruneGearPlan(character, snapshot);
    const message = refreshMessage(removedNames, pruneNotInterested(character, snapshot));
    if (message !== null) {
      setStatus(message, "success");
    }
    render();
  } catch (error) {
    setStatus((error as Error).message, "error");
  } finally {
    isRefreshing.value = false;
  }
}
