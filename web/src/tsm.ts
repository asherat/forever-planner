import { braceBalance, isLuaTable, parseLuaValue } from "./lua.ts";
import type { LuaTable, LuaValue } from "./lua.ts";

export type TsmPriceRow = Record<string, number>;

export interface TsmPriceSet {
  setName: string;
  scope: string;
  downloadTime: number;
  rows: Record<string, TsmPriceRow>;
}

export interface TsmPrices {
  prices: Record<string, TsmPriceRow>;
  scope: string | null;
  downloadedAt: number;
}

export interface TsmProfession {
  name: string;
  level: number;
  maxLevel: number;
}

export interface TsmInventoryCharacter {
  name: string;
  faction: string;
  ruleset: string;
  bags: Record<string, number>;
  bank: Record<string, number>;
  mail: Record<string, number>;
  auctions: Record<string, number>;
  money: number;
  professions: TsmProfession[];
  classKey: string;
}

const LINE_PATTERN = /LoadData\("([A-Z_]+)","([^"]+)",\[\[return (.*)\]\]\)/;
const FIELDS_PATTERN = /fields=\{([^}]*)\}/;
const DOWNLOAD_TIME_PATTERN = /downloadTime=(\d+)/;
const ROW_PATTERN = /\{([^{}]*)\}/g;
const REGION_SETS = ["AUCTIONDB_REGION_STAT", "AUCTIONDB_REGION_SALE", "AUCTIONDB_REGION_HISTORICAL"];
const LOCAL_SETS = ["AUCTIONDB_NON_COMMODITY_DATA", "AUCTIONDB_NON_COMMODITY_SCAN_STAT", "AUCTIONDB_NON_COMMODITY_HISTORICAL"];
const INVENTORY_LINE_PATTERN = /^\s*\["s@(.+?) - (Horde|Alliance) - (.+?)@internalData@(\w+)"\] = (.*)$/;
const INVENTORY_FIELDS = ["bagQuantity", "bankQuantity", "mailQuantity", "auctionQuantity", "money", "playerProfessions", "classKey"];

function decodeValue(rawValue: string): number {
  return parseInt(rawValue, 32);
}

export function tsmItemId(rawItemString: string): number | null {
  const itemString = rawItemString.replace(/"/g, "");
  if (/^\d+$/.test(itemString)) {
    return Number(itemString);
  }
  const match = /^i:(\d+):*$/.exec(itemString);
  if (match !== null) {
    return Number(match[1]);
  }
  return null;
}

function parseLine(line: string): TsmPriceSet | null {
  const lineMatch = LINE_PATTERN.exec(line);
  if (lineMatch === null) {
    return null;
  }
  const body = lineMatch[3];
  const fieldsMatch = FIELDS_PATTERN.exec(body);
  if (fieldsMatch === null) {
    return null;
  }
  const fields = fieldsMatch[1].replace(/"/g, "").split(",");
  const dataStart = body.indexOf("data={");
  const rows: Record<string, TsmPriceRow> = {};
  if (dataStart !== -1) {
    const dataText = body.slice(dataStart + "data={".length);
    ROW_PATTERN.lastIndex = 0;
    let rowMatch = ROW_PATTERN.exec(dataText);
    while (rowMatch !== null) {
      const values = rowMatch[1].split(",");
      const itemId = tsmItemId(values[0]);
      if (itemId !== null) {
        const row: TsmPriceRow = {};
        for (let fieldIndex = 1; fieldIndex < fields.length && fieldIndex < values.length; fieldIndex += 1) {
          row[fields[fieldIndex]] = decodeValue(values[fieldIndex]);
        }
        rows[itemId] = row;
      }
      rowMatch = ROW_PATTERN.exec(dataText);
    }
  }
  let downloadTime = 0;
  const downloadTimeMatch = DOWNLOAD_TIME_PATTERN.exec(body);
  if (downloadTimeMatch !== null) {
    downloadTime = Number(downloadTimeMatch[1]) * 1000;
  }
  return { setName: lineMatch[1], scope: lineMatch[2], downloadTime: downloadTime, rows: rows };
}

export function parseTsmAppData(text: string): TsmPriceSet[] {
  const sets: TsmPriceSet[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (parsed !== null) {
      sets.push(parsed);
    }
  }
  return sets;
}

function scopeForCharacter(sets: TsmPriceSet[], rulesetName: string, factionName: string): string | null {
  const wanted = (rulesetName + "-" + factionName).toLowerCase();
  for (const set of sets) {
    if (LOCAL_SETS.indexOf(set.setName) !== -1 && set.scope.toLowerCase() === wanted) {
      return set.scope;
    }
  }
  return null;
}

function mergePrices(sets: TsmPriceSet[], localScope: string | null): TsmPrices {
  const prices: Record<string, TsmPriceRow> = {};
  let newestDownload = 0;
  for (const set of sets) {
    const isRegionSet = REGION_SETS.indexOf(set.setName) !== -1;
    const isLocalSet = LOCAL_SETS.indexOf(set.setName) !== -1 && set.scope === localScope;
    if (!isRegionSet && !isLocalSet) {
      continue;
    }
    newestDownload = Math.max(newestDownload, set.downloadTime);
    for (const itemId of Object.keys(set.rows)) {
      prices[itemId] = Object.assign(prices[itemId] || {}, set.rows[itemId]);
    }
  }
  return { prices: prices, scope: localScope, downloadedAt: newestDownload };
}

export function readTsmPrices(text: string, rulesetName: string, factionName: string): TsmPrices {
  const sets = parseTsmAppData(text);
  if (sets.length === 0) {
    throw new Error("That file has no TSM price data. Pick AppData.lua from the TradeSkillMaster_AppHelper folder.");
  }
  return mergePrices(sets, scopeForCharacter(sets, rulesetName, factionName));
}

function itemCounts(value: LuaValue): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!isLuaTable(value)) {
    return counts;
  }
  for (const itemString of Object.keys(value)) {
    const itemId = tsmItemId(itemString);
    const amount = value[itemString];
    if (itemId !== null && typeof amount === "number") {
      counts[itemId] = (counts[itemId] || 0) + amount;
    }
  }
  return counts;
}

function numberField(table: LuaTable, firstName: string, secondName: string): number {
  const first = table[firstName];
  if (typeof first === "number") {
    return first;
  }
  const second = table[secondName];
  if (typeof second === "number") {
    return second;
  }
  return 0;
}

function professionList(value: LuaValue): TsmProfession[] {
  const professions: TsmProfession[] = [];
  if (!isLuaTable(value)) {
    return professions;
  }
  for (const name of Object.keys(value)) {
    const entry = value[name];
    let level = 0;
    let maxLevel = 0;
    if (isLuaTable(entry)) {
      level = numberField(entry, "level", "skillLevel");
      maxLevel = numberField(entry, "maxLevel", "skillMaxLevel");
    }
    professions.push({ name: name, level: level, maxLevel: maxLevel });
  }
  return professions;
}

function emptyCharacter(name: string, faction: string, ruleset: string): TsmInventoryCharacter {
  return { name: name, faction: faction, ruleset: ruleset, bags: {}, bank: {}, mail: {}, auctions: {}, money: 0, professions: [], classKey: "" };
}

function storeField(character: TsmInventoryCharacter, fieldName: string, value: LuaValue): void {
  if (fieldName === "bagQuantity") {
    character.bags = itemCounts(value);
  } else if (fieldName === "bankQuantity") {
    character.bank = itemCounts(value);
  } else if (fieldName === "mailQuantity") {
    character.mail = itemCounts(value);
  } else if (fieldName === "auctionQuantity") {
    character.auctions = itemCounts(value);
  } else if (fieldName === "money") {
    character.money = Number(value) || 0;
  } else if (fieldName === "playerProfessions") {
    character.professions = professionList(value);
  } else if (fieldName === "classKey") {
    character.classKey = String(value || "");
  }
}

export function parseTsmInventory(text: string): Record<string, TsmInventoryCharacter> {
  const characters: Record<string, TsmInventoryCharacter> = {};
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = INVENTORY_LINE_PATTERN.exec(lines[index]);
    if (match === null || INVENTORY_FIELDS.indexOf(match[4]) === -1) {
      continue;
    }
    let valueText = match[5];
    let balance = braceBalance(valueText);
    while (balance > 0 && index + 1 < lines.length) {
      index += 1;
      valueText += "\n" + lines[index];
      balance += braceBalance(lines[index]);
    }
    const name = match[1];
    if (!characters[name]) {
      characters[name] = emptyCharacter(name, match[2], match[3]);
    }
    try {
      storeField(characters[name], match[4], parseLuaValue(valueText.replace(/,\s*$/, "")));
    } catch {
      continue;
    }
  }
  return characters;
}

export const TSM = {
  addonName: "TradeSkillMaster_AppHelper",
  fileName: "AppData.lua",
  savedVariablesFile: "TradeSkillMaster.lua",
  readPrices: readTsmPrices,
  parseInventory: parseTsmInventory,
  parseAppData: parseTsmAppData
};
