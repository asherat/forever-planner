import { reactive } from "vue";
import "../legacy.ts";
import { characterSpecs, specLabel } from "../scoring.ts";
import { clampedLookahead, validatedSettings } from "../settings.ts";
import { inventoryStatusText, questieStatusText, readWowFolder, tsmStatusText } from "../folder-data.ts";
import { STORAGE_KEYS, characterSlug, findCharacter, saveSettings, saveSnapshots, setStatus, state, writeStorage } from "../state.ts";
import { WOW_FOLDER } from "../wow-folder.ts";
import { render } from "../gear.ts";

export const SETTINGS_TABS = [
  { key: "characters", label: "Characters" },
  { key: "battlenet", label: "Battle.net" },
  { key: "folder", label: "WoW folder" },
  { key: "backup", label: "Backup" }
];

export const settingsForm = reactive({
  tab: "characters",
  clientId: "",
  clientSecret: "",
  region: "eu",
  lookahead: "",
  newName: "",
  newSurname: ""
});

interface Credentials {
  clientId: string;
  clientSecret: string;
}

function credentials(): Credentials {
  return state.credentials as Credentials;
}

function settingsDialog(): HTMLDialogElement {
  return document.getElementById("settings-dialog") as HTMLDialogElement;
}

export function showSettingsTab(tabKey: string): void {
  settingsForm.tab = tabKey;
}

export function openSettings(): void {
  settingsForm.clientId = credentials().clientId;
  settingsForm.clientSecret = credentials().clientSecret;
  settingsForm.region = state.settings.region;
  settingsForm.lookahead = String(state.settings.lookaheadLevels);
  let firstTab = "characters";
  if (!credentials().clientId || !credentials().clientSecret) {
    firstTab = "battlenet";
  }
  showSettingsTab(firstTab);
  settingsDialog().showModal();
}

export function closeSettings(): void {
  const clientId = settingsForm.clientId.trim();
  const clientSecret = settingsForm.clientSecret.trim();
  if (clientId !== credentials().clientId || clientSecret !== credentials().clientSecret) {
    state.accessToken = null;
  }
  state.credentials = { clientId: clientId, clientSecret: clientSecret };
  writeStorage(STORAGE_KEYS.credentials, state.credentials);
  state.settings.region = settingsForm.region;
  state.settings.lookaheadLevels = clampedLookahead(settingsForm.lookahead);
  saveSettings();
  render();
}

export interface CharacterRow {
  slug: string;
  name: string;
  summary: string;
  removeLabel: string;
}

export function characterRows(): CharacterRow[] {
  const rows: CharacterRow[] = [];
  for (const character of state.settings.characters) {
    const snapshot = state.snapshots[character.slug];
    let summary = "Press Refresh to load";
    if (snapshot) {
      const specNames: string[] = [];
      for (const specKey of characterSpecs(character, snapshot)) {
        specNames.push(specLabel(specKey));
      }
      summary = "Level " + snapshot.level + " " + snapshot.className + " · " + specNames.join(" / ");
    }
    rows.push({ slug: character.slug, name: character.displayName, summary: summary, removeLabel: "Remove " + character.displayName });
  }
  return rows;
}

export function removeCharacter(slug: string): void {
  const remaining = state.settings.characters.filter(function isKept(character) {
    return character.slug !== slug;
  });
  state.settings.characters = remaining;
  delete state.snapshots[slug];
  if (state.settings.selectedCharacterSlug === slug) {
    state.settings.selectedCharacterSlug = null;
    if (remaining.length > 0) {
      state.settings.selectedCharacterSlug = remaining[0].slug;
    }
  }
  saveSettings();
  saveSnapshots();
  render();
}

export function addCharacterNamed(name: string, surname: string): boolean {
  const slug = characterSlug(name, surname);
  if (findCharacter(slug) !== null) {
    setStatus(name + " " + surname + " is already in your list.", "error");
    return false;
  }
  state.settings.characters.push({ slug: slug, displayName: name + " " + surname, hiddenItemIds: [] });
  state.settings.selectedCharacterSlug = slug;
  saveSettings();
  render();
  return true;
}

export function addCharacterFromForm(): void {
  const name = settingsForm.newName.trim();
  const surname = settingsForm.newSurname.trim();
  if (!name || !surname) {
    setStatus("Enter both the first name and the surname.", "error");
    return;
  }
  if (addCharacterNamed(name, surname)) {
    settingsForm.newName = "";
    settingsForm.newSurname = "";
  }
}

export interface FoundCharacter {
  name: string;
  surname: string;
  label: string;
}

interface Inventory {
  characters: Record<string, { ruleset: string }>;
}

export function foundCharacters(): FoundCharacter[] {
  const found: FoundCharacter[] = [];
  const inventory = state.inventory as Inventory | null;
  if (inventory === null) {
    return found;
  }
  for (const fullName of Object.keys(inventory.characters).sort()) {
    const separator = fullName.indexOf(" ");
    if (separator === -1) {
      continue;
    }
    const name = fullName.slice(0, separator);
    const surname = fullName.slice(separator + 1);
    if (findCharacter(characterSlug(name, surname)) === null) {
      found.push({ name: name, surname: surname, label: "Add " + name + " " + surname + " (" + inventory.characters[fullName].ruleset + ")" });
    }
  }
  return found;
}

export function folderStatusText(): string {
  if (state.wowFolderConnected) {
    return "Connected.";
  }
  if (state.tsm !== null) {
    return "Not connected. TSM prices still come from the AppData.lua file you picked earlier.";
  }
  return "Not connected.";
}

export interface SourceStatus {
  key: string;
  text: string;
  found: boolean;
}

export function sourceStatuses(): SourceStatus[] {
  return [
    { key: "questie-status", text: questieStatusText(), found: state.questie !== null },
    { key: "tsm-status", text: tsmStatusText(), found: state.tsm !== null },
    { key: "inventory-status", text: inventoryStatusText(), found: state.inventory !== null }
  ];
}

export async function connectWowFolder(): Promise<void> {
  if (!window.showDirectoryPicker) {
    setStatus("This browser can't read local folders. Use Chrome.", "error");
    return;
  }
  try {
    const folder = await window.showDirectoryPicker({ id: "wow-folder", mode: "read" });
    if ((await WOW_FOLDER.addonsDirectory(folder)) === null) {
      setStatus("That folder has no Interface/AddOns inside. Pick your World of Warcraft or _forever_ folder.", "error");
      return;
    }
    await WOW_FOLDER.storeHandle(WOW_FOLDER.folderKey, folder);
    await WOW_FOLDER.forgetHandle(WOW_FOLDER.legacyTsmFileKey);
    setStatus("Reading Questie and TSM data…", "info");
    await readWowFolder(true);
    setStatus("WoW folder connected.", "success");
    render();
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      setStatus((error as Error).message, "error");
    }
  }
}

export async function disconnectWowFolder(): Promise<void> {
  await WOW_FOLDER.forgetHandle(WOW_FOLDER.folderKey);
  await WOW_FOLDER.forgetHandle(WOW_FOLDER.legacyTsmFileKey);
  state.tsm = null;
  state.questie = null;
  state.inventory = null;
  state.wowFolderConnected = false;
  render();
}

export function exportSettings(): void {
  const blob = new Blob([JSON.stringify(state.settings, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "forever-planner-settings.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function applyImportedText(text: string): void {
  try {
    const imported = validatedSettings(JSON.parse(text));
    if (imported === null) {
      setStatus("That file is not a valid settings file. Nothing was changed.", "error");
      return;
    }
    state.settings = imported;
    saveSettings();
    render();
    setStatus("Settings loaded.", "success");
  } catch (error) {
    setStatus("That file is not a valid settings file.", "error");
  }
}

export async function importSettings(file: File): Promise<void> {
  applyImportedText(await file.text());
}
