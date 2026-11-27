import type { TakingLine } from "../crafting-plan.ts";

const PLACE_LABELS: Record<string, string> = { bags: "bags", bank: "bank", mail: "mailbox", auctions: "on the AH" };

export function takingPlaces(line: TakingLine): string {
  const places: string[] = [];
  for (const place of Object.keys(line.places)) {
    places.push(line.places[place] + " in " + PLACE_LABELS[place]);
  }
  return line.character + ": " + places.join(", ");
}
