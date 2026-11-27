import { craftingItem } from "../crafting-plan.ts";
import { setStatus } from "../state.ts";

export interface ExportLine {
  itemId: number;
  quantity: number;
  fromVendor: boolean;
}

export type ExportKind = "tsm" | "auctionator" | "text";

const PASTE_HINTS: Record<ExportKind, string> = {
  tsm: "Vendor items are left out. Paste it in the search box of TSM's Shopping tab.",
  auctionator: "Vendor items are left out. In Auctionator's Shopping tab, press Import and paste it.",
  text: "Paste it anywhere."
};

export function tsmSearchText(lines: ExportLine[]): string {
  return lines.map(function itemSearch(line) {
    return "i:" + line.itemId + "/x" + line.quantity;
  }).join(";");
}

export function auctionatorListText(listName: string, lines: ExportLine[]): string {
  return [listName].concat(lines.map(function exactName(line) {
    return "\"" + craftingItem(line.itemId).name + "\"";
  })).join("^");
}

export function plainListText(lines: ExportLine[]): string {
  return lines.map(function amountAndName(line) {
    return line.quantity + "x " + craftingItem(line.itemId).name;
  }).join("\n");
}

function isForTheAuctionHouse(line: ExportLine): boolean {
  return !line.fromVendor;
}

export function exportedLines(kind: ExportKind, lines: ExportLine[]): ExportLine[] {
  if (kind === "text") {
    return lines;
  }
  return lines.filter(isForTheAuctionHouse);
}

export function exportText(kind: ExportKind, listName: string, lines: ExportLine[]): string {
  const exported = exportedLines(kind, lines);
  if (kind === "tsm") {
    return tsmSearchText(exported);
  }
  if (kind === "auctionator") {
    return auctionatorListText(listName, exported);
  }
  return plainListText(exported);
}

export async function copyShoppingList(kind: ExportKind, listName: string, lines: ExportLine[]): Promise<void> {
  const text = exportText(kind, listName, lines);
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied " + exportedLines(kind, lines).length + " items. " + PASTE_HINTS[kind], "success");
  } catch {
    setStatus(text, "info");
  }
}
