import "./legacy.ts";
import { readWowFolder, useFolderScope } from "./folder-data.ts";
import type { PriceScope } from "./crafting-plan.ts";
import { enableMapPopovers } from "./map-popover.ts";
import { clearSourceCache } from "./sources.ts";
import { loadState, selectedCharacter, setStatus, state } from "./state.ts";
import { queueTooltipChecks, runTooltipChecks } from "./tooltip-checks.ts";
import type { PairedUpgradeOptions, UpgradeOptions } from "./types.ts";
import { craftedUpgradePicks, questUpgradePicks } from "./ui/upgrade-picks.ts";
import { blockQuestPicks, compareUpgradeOptions, emptyBlockList, observeRanking, pairedUpgradeOptions, upgradeOptions } from "./upgrades.ts";

export function render(): void {
  clearSourceCache();
  const character = selectedCharacter();
  if (character === null || !state.snapshots[character.slug]) {
    if (character !== null) {
      setStatus("Press Refresh to load " + character.displayName + ".", "info");
    }
    return;
  }
  const snapshot = state.snapshots[character.slug];
  const optionsBySlot: Record<string, UpgradeOptions> = {};
  const allOptions: (UpgradeOptions | PairedUpgradeOptions)[] = [];
  const handledPairs = new Set<string>();
  const weaponQuests = emptyBlockList();
  for (const slotDefinition of window.GAME_RULES.equipmentSlots) {
    if (slotDefinition.cosmetic || handledPairs.has(slotDefinition.key)) {
      continue;
    }
    if (slotDefinition.pairedWith) {
      handledPairs.add(slotDefinition.key);
      handledPairs.add(slotDefinition.pairedWith);
      const group = pairedUpgradeOptions(slotDefinition, snapshot, character);
      for (const part of group.parts) {
        optionsBySlot[part.slotDefinition.key] = part;
      }
      if (group.parts.length > 0) {
        allOptions.push(group);
      }
      continue;
    }
    let blocked = emptyBlockList();
    if (slotDefinition.key === "MAIN_HAND" || slotDefinition.key === "OFF_HAND") {
      blocked = weaponQuests;
    }
    const options = upgradeOptions(slotDefinition, snapshot, character, blocked);
    if (options === null) {
      continue;
    }
    if (slotDefinition.key === "MAIN_HAND") {
      blockQuestPicks(options, snapshot, weaponQuests);
    }
    optionsBySlot[slotDefinition.key] = options;
    allOptions.push(options);
  }
  state.upgradesBySlot = optionsBySlot;
  allOptions.sort(compareUpgradeOptions);
  state.upgradeOptions = allOptions;
  state.craftedUpgradePicks = craftedUpgradePicks(allOptions, snapshot);
  state.questUpgradePicks = questUpgradePicks(allOptions, snapshot);
  runTooltipChecks();
}

export function currentPriceScope(): PriceScope {
  const character = selectedCharacter();
  if (character !== null && state.snapshots[character.slug]) {
    const snapshot = state.snapshots[character.slug];
    return { ruleset: snapshot.ruleset, faction: snapshot.faction as string };
  }
  return { ruleset: "", faction: "" };
}

export function questieQuestIds(): number[] {
  const questIds = new Set<number>();
  for (const item of window.FOREVER_ITEMS) {
    for (const source of item.sources || []) {
      if (source.type === "quest") {
        questIds.add(source.questId as number);
      }
    }
  }
  return Array.from(questIds);
}

export function questieItemIds(): number[] {
  const itemIds = new Set<number>();
  for (const item of window.FOREVER_ITEMS) {
    itemIds.add(item.id);
    for (const source of item.sources || []) {
      for (const reagent of (source.reagents || []) as { id: number }[]) {
        itemIds.add(reagent.id);
      }
    }
  }
  return Array.from(itemIds);
}

export function handleTsmStartupError(error: Error): void {
  setStatus("Could not read your WoW folder: " + error.message, "error");
}

export function startGearPage(): void {
  useFolderScope({ currentPriceScope: currentPriceScope, questieItemIds: questieItemIds, questieQuestIds: questieQuestIds });
  observeRanking(queueTooltipChecks);
  enableMapPopovers();
  loadState();
  if (!window.FOREVER_ITEMS) {
    setStatus("Game data is missing (web/data/items.js). Pull the latest version of the planner.", "error");
    return;
  }
  render();
  readWowFolder(false).then(render).catch(handleTsmStartupError);
  if (state.settings.characters.length === 0) {
    setStatus("Open Settings to add your API client and a character.", "info");
  }
}
