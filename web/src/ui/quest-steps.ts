import "../legacy.ts";
import { CLASS_BITS } from "../sources.ts";
import type { Snapshot } from "../types.ts";
import type { ChainStep, Place } from "../questie.ts";
import { setStatus } from "../state.ts";

export function isChainStepForCharacter(step: ChainStep, snapshot: Snapshot): boolean {
  if (step.faction !== null && step.faction !== snapshot.factionType) {
    return false;
  }
  const classBit = CLASS_BITS[snapshot.className];
  return !step.classes || !classBit || Boolean(step.classes & classBit);
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
