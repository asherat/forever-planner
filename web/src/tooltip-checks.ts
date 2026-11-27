import "./legacy.ts";
import { render } from "./gear.ts";
import { REPUTATION_TIER_NAMES, sourcesForCharacter } from "./sources.ts";
import { STORAGE_KEYS, state, writeStorage } from "./state.ts";
import type { Candidate, Item, ReputationRequirement, Snapshot } from "./types.ts";

const WOWHEAD_TOOLTIP_URL = "https://nether.wowhead.com/forever/tooltip/item/";
const MAX_TOOLTIP_CHECKS_PER_RUN = 60;
const TOOLTIP_CHECK_BATCH = 4;
const TOOLTIP_CHECKS_PER_SLOT = 5;
const TOOLTIP_CACHE_DAYS = 14;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const REQUIREMENT_PATTERN = /Requires ([A-Z][A-Za-z' -]+?) - (Hated|Hostile|Unfriendly|Neutral|Friendly|Honored|Revered|Exalted)/g;

export const tooltipChecks = { pending: new Set<number>(), running: false };

function isTooltipLookupFresh(itemId: number): boolean {
  const looked = state.tooltipRequirements[itemId];
  if (!looked) {
    return false;
  }
  let maximumAge = TOOLTIP_CACHE_DAYS * DAY_IN_MILLISECONDS;
  if (looked.failed) {
    maximumAge = DAY_IN_MILLISECONDS;
  }
  return Date.now() - (looked.checkedAt || 0) < maximumAge;
}

function needsTooltipCheck(item: Item, snapshot: Snapshot): boolean {
  if (item.reputationRequirement || isTooltipLookupFresh(item.id)) {
    return false;
  }
  for (const source of sourcesForCharacter(item, snapshot)) {
    if (source.type === "vendor") {
      return true;
    }
  }
  return false;
}

export function queueTooltipChecks(candidates: Candidate[], snapshot: Snapshot): void {
  for (const candidate of candidates.slice(0, TOOLTIP_CHECKS_PER_SLOT)) {
    if (needsTooltipCheck(candidate.item, snapshot)) {
      tooltipChecks.pending.add(candidate.item.id);
    }
  }
}

export function parseTooltipRequirements(tooltipHtml: string): ReputationRequirement[] {
  const text = tooltipHtml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const requirements: ReputationRequirement[] = [];
  for (const match of text.matchAll(REQUIREMENT_PATTERN)) {
    const faction = window.FOREVER_REPUTATIONS[match[1]];
    if (faction) {
      requirements.push({
        factionId: faction.id,
        side: faction.side,
        tier: REPUTATION_TIER_NAMES.indexOf(match[2]),
        text: "Requires " + match[1] + " - " + match[2]
      });
    }
  }
  return requirements;
}

function failedLookup(itemId: number): void {
  state.tooltipRequirements[itemId] = { reputations: [], failed: true, checkedAt: Date.now() };
}

async function lookUpTooltipRequirement(itemId: number): Promise<void> {
  try {
    const response = await fetch(WOWHEAD_TOOLTIP_URL + itemId + "?locale=0");
    if (!response.ok) {
      failedLookup(itemId);
      return;
    }
    const tooltip = await response.json();
    state.tooltipRequirements[itemId] = { reputations: parseTooltipRequirements(tooltip.tooltip || ""), checkedAt: Date.now() };
  } catch (error) {
    failedLookup(itemId);
  }
}

export async function runTooltipChecks(): Promise<void> {
  if (tooltipChecks.running || tooltipChecks.pending.size === 0) {
    return;
  }
  tooltipChecks.running = true;
  const itemIds = Array.from(tooltipChecks.pending).slice(0, MAX_TOOLTIP_CHECKS_PER_RUN);
  tooltipChecks.pending.clear();
  for (let start = 0; start < itemIds.length; start += TOOLTIP_CHECK_BATCH) {
    await Promise.all(itemIds.slice(start, start + TOOLTIP_CHECK_BATCH).map(lookUpTooltipRequirement));
  }
  writeStorage(STORAGE_KEYS.tooltipRequirements, state.tooltipRequirements);
  tooltipChecks.running = false;
  render();
}
