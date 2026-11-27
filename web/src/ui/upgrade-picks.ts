import "../legacy.ts";
import { firstCraftSource, firstQuestSource, sourcesForCharacter } from "../sources.ts";
import type { Candidate, PairedUpgradeOptions, Snapshot, UpgradeOptions } from "../types.ts";
import type { QuestListEntry } from "./quest-list.ts";

function isGroup(options: UpgradeOptions | PairedUpgradeOptions): options is PairedUpgradeOptions {
  return "group" in options && options.group === true;
}

function upgradeParts(allOptions: (UpgradeOptions | PairedUpgradeOptions)[]): UpgradeOptions[] {
  const parts: UpgradeOptions[] = [];
  for (const options of allOptions) {
    if (isGroup(options)) {
      for (const part of options.parts) {
        parts.push(part);
      }
    } else {
      parts.push(options);
    }
  }
  return parts;
}

function isCrafted(candidate: Candidate, snapshot: Snapshot): boolean {
  return firstCraftSource(sourcesForCharacter(candidate.item, snapshot)) !== null;
}

function craftedPick(options: UpgradeOptions, snapshot: Snapshot): number | null {
  if (isCrafted(options.best, snapshot)) {
    return options.best.item.id;
  }
  if (options.quicker !== null && isCrafted(options.quicker, snapshot)) {
    return options.quicker.item.id;
  }
  return null;
}

export function craftedUpgradePicks(allOptions: (UpgradeOptions | PairedUpgradeOptions)[], snapshot: Snapshot): number[] {
  const picks: number[] = [];
  for (const part of upgradeParts(allOptions)) {
    const itemId = craftedPick(part, snapshot);
    if (itemId !== null && picks.indexOf(itemId) === -1) {
      picks.push(itemId);
    }
  }
  return picks;
}

function questPick(candidate: Candidate, snapshot: Snapshot): QuestListEntry | null {
  const questSource = firstQuestSource(sourcesForCharacter(candidate.item, snapshot));
  if (questSource === null || questSource.questId === undefined) {
    return null;
  }
  return { questId: questSource.questId, itemId: candidate.item.id };
}

export function questUpgradePicks(allOptions: (UpgradeOptions | PairedUpgradeOptions)[], snapshot: Snapshot): QuestListEntry[] {
  const picks: QuestListEntry[] = [];
  const questIds = new Set<number>();
  for (const part of upgradeParts(allOptions)) {
    let pick = questPick(part.best, snapshot);
    if (pick === null && part.quicker !== null) {
      pick = questPick(part.quicker, snapshot);
    }
    if (pick !== null && !questIds.has(pick.questId)) {
      questIds.add(pick.questId);
      picks.push(pick);
    }
  }
  return picks;
}
