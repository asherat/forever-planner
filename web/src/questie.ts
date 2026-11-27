import type { ItemSource, QuestieData, QuestieItemDetail, QuestieQuest } from "./types.ts";

export type CborValue = number | string | boolean | null | CborValue[] | CborMap;
export interface CborMap {
  [key: string]: CborValue;
}

type Zones = Record<string, string>;

interface QuestieReader {
  entries: Map<string, string>;
  cache: Map<string, CborValue | null>;
}

export interface Place {
  kind: string;
  name: string;
  title: string;
  zone: string;
  x: number | null;
  y: number | null;
}

export interface ChainStep extends QuestieQuest {
  starter: Place | null;
  requiresAll: number[];
  requiresAny: number[];
}

export interface QuestieDetails extends QuestieData {
  version: string;
  items: Record<string, QuestieItemDetail>;
  quests: Record<string, QuestieQuest>;
  reader: QuestieReader;
  zones: Zones;
  modifiedAt?: number;
  dungeonEntrances?: Record<string, { zone: string; x: number; y: number }>;
  starterCache?: Map<number, Place | null>;
}

interface NpcInfo {
  id: number;
  name: string;
  title: string;
  minLevel: number;
  maxLevel: number;
  rank: number;
  zone: string;
  friendlyTo: string;
}

interface CborCursor {
  bytes: Uint8Array;
  view: DataView;
  offset: number;
}

const KEY_PREFIX = "## X-";
const CHUNK_PATTERN = /^~(\d+)~$/;
const ENTITY_PREFIXES = ["Item-", "Npc-", "Object-", "Quest-"];
const ITEM_FIELDS = { npcDrops: 2, objectDrops: 3, questRewards: 6, vendors: 14 };
const NPC_FIELDS = { name: 1, minLevel: 4, maxLevel: 5, rank: 6, spawns: 7, zone: 9, friendlyTo: 13, title: 14 };
const OBJECT_FIELDS = { name: 1, spawns: 4, zone: 5 };
const QUEST_FIELDS = { name: 1, startedBy: 2, requiredLevel: 4, questLevel: 5, requiredRaces: 6, requiredClasses: 7, preQuestGroup: 12, preQuestSingle: 13, zone: 17 };
const MAX_CHAIN_LENGTH = 60;
const ALLIANCE_RACE_MASK = 1 + 4 + 8 + 64;
const HORDE_RACE_MASK = 2 + 16 + 32 + 128;
const MAX_DROP_SOURCES = 3;
const ITEM_NAME_FIELD = 1;
const WORLD_DROP_THRESHOLD = 12;
const utf8Decoder = new TextDecoder("utf-8");

function readArgument(cursor: CborCursor, additional: number): number {
  if (additional < 24) {
    return additional;
  }
  if (additional === 24) {
    cursor.offset += 1;
    return cursor.view.getUint8(cursor.offset - 1);
  }
  if (additional === 25) {
    cursor.offset += 2;
    return cursor.view.getUint16(cursor.offset - 2);
  }
  if (additional === 26) {
    cursor.offset += 4;
    return cursor.view.getUint32(cursor.offset - 4);
  }
  cursor.offset += 8;
  return Number(cursor.view.getBigUint64(cursor.offset - 8));
}

function halfPrecisionFloat(bits: number): number {
  let sign = 1;
  if (bits & 0x8000) {
    sign = -1;
  }
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) {
    return sign * Math.pow(2, -14) * (fraction / 1024);
  }
  if (exponent === 31) {
    if (fraction === 0) {
      return sign * Infinity;
    }
    return NaN;
  }
  return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

function readSimple(cursor: CborCursor, additional: number): CborValue {
  if (additional === 20) {
    return false;
  }
  if (additional === 21) {
    return true;
  }
  if (additional === 22 || additional === 23) {
    return null;
  }
  if (additional === 25) {
    cursor.offset += 2;
    return halfPrecisionFloat(cursor.view.getUint16(cursor.offset - 2));
  }
  if (additional === 26) {
    cursor.offset += 4;
    return cursor.view.getFloat32(cursor.offset - 4);
  }
  if (additional === 27) {
    cursor.offset += 8;
    return cursor.view.getFloat64(cursor.offset - 8);
  }
  throw new Error("Unsupported CBOR simple value " + additional);
}

function readValue(cursor: CborCursor): CborValue {
  const initial = cursor.view.getUint8(cursor.offset);
  cursor.offset += 1;
  const majorType = initial >> 5;
  const additional = initial & 31;
  if (majorType === 7) {
    return readSimple(cursor, additional);
  }
  const argument = readArgument(cursor, additional);
  if (majorType === 0) {
    return argument;
  }
  if (majorType === 1) {
    return -1 - argument;
  }
  if (majorType === 2 || majorType === 3) {
    const text = utf8Decoder.decode(cursor.bytes.subarray(cursor.offset, cursor.offset + argument));
    cursor.offset += argument;
    return text;
  }
  if (majorType === 4) {
    const list: CborValue[] = [];
    for (let index = 0; index < argument; index += 1) {
      list.push(readValue(cursor));
    }
    return list;
  }
  if (majorType === 5) {
    const map: CborMap = {};
    for (let index = 0; index < argument; index += 1) {
      const key = readValue(cursor);
      map[String(key)] = readValue(cursor);
    }
    return map;
  }
  throw new Error("Unsupported CBOR major type " + majorType);
}

export function decodeCbor(bytes: Uint8Array): CborValue {
  return readValue({ bytes: bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset: 0 });
}

function base64Bytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isEntityKey(key: string): boolean {
  for (const prefix of ENTITY_PREFIXES) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function indexToc(text: string): { entries: Map<string, string>; version: string } {
  const entries = new Map<string, string>();
  let version = "";
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## Version: ")) {
      version = line.slice("## Version: ".length).trim();
      continue;
    }
    if (!line.startsWith(KEY_PREFIX)) {
      continue;
    }
    const separator = line.indexOf(": ");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(KEY_PREFIX.length, separator);
    if (isEntityKey(key)) {
      entries.set(key, line.slice(separator + 2).trim());
    }
  }
  return { entries: entries, version: version };
}

function rawTocValue(reader: QuestieReader, key: string): string | null {
  const value = reader.entries.get(key);
  if (value === undefined) {
    return null;
  }
  const chunkMatch = CHUNK_PATTERN.exec(value);
  if (chunkMatch === null) {
    return value;
  }
  let combined = "";
  for (let part = 1; part <= Number(chunkMatch[1]); part += 1) {
    combined += reader.entries.get(key + "-" + part) || "";
  }
  return combined;
}

function decodedTocValue(reader: QuestieReader, key: string): CborValue | null {
  const cached = reader.cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const raw = rawTocValue(reader, key);
  let value: CborValue | null = null;
  if (raw !== null) {
    value = decodeCbor(base64Bytes(raw));
  }
  reader.cache.set(key, value);
  return value;
}

function isMap(value: CborValue | null | undefined): value is CborMap {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function asList(value: CborValue | null | undefined): CborValue[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function asNumbers(value: CborValue | null | undefined): number[] {
  const numbers: number[] = [];
  for (const entry of asList(value)) {
    if (typeof entry === "number") {
      numbers.push(entry);
    }
  }
  return numbers;
}

function asNumber(value: CborValue | undefined): number {
  if (typeof value === "number") {
    return value;
  }
  return 0;
}

function asText(value: CborValue | undefined, fallback: string): string {
  if (typeof value === "string" && value !== "") {
    return value;
  }
  return fallback;
}

function asKeyedTable(value: CborValue | null): CborMap | null {
  if (isMap(value)) {
    return value;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const keyed: CborMap = {};
  for (let index = 0; index < value.length; index += 1) {
    keyed[index + 1] = value[index];
  }
  return keyed;
}

function entityScalars(reader: QuestieReader, entityType: string, entityId: number): CborMap {
  return asKeyedTable(decodedTocValue(reader, entityType + "-" + entityId + "-S")) || {};
}

function entityTable(reader: QuestieReader, entityType: string, entityId: number, fieldIndex: number): CborValue[] {
  return asList(decodedTocValue(reader, entityType + "-" + entityId + "-" + fieldIndex));
}

function zoneName(zones: Zones, zoneId: CborValue | undefined): string {
  if (typeof zoneId === "number" && zones[zoneId]) {
    return zones[zoneId];
  }
  return "";
}

function npcInfo(reader: QuestieReader, zones: Zones, npcId: number): NpcInfo {
  const row = entityScalars(reader, "Npc", npcId);
  return {
    id: npcId,
    name: asText(row[NPC_FIELDS.name], "Unknown creature"),
    title: asText(row[NPC_FIELDS.title], ""),
    minLevel: asNumber(row[NPC_FIELDS.minLevel]),
    maxLevel: asNumber(row[NPC_FIELDS.maxLevel]),
    rank: asNumber(row[NPC_FIELDS.rank]),
    zone: zoneName(zones, row[NPC_FIELDS.zone]),
    friendlyTo: asText(row[NPC_FIELDS.friendlyTo], "")
  };
}

function questInfo(reader: QuestieReader, zones: Zones, questId: number): QuestieQuest {
  const row = entityScalars(reader, "Quest", questId);
  const races = asNumber(row[QUEST_FIELDS.requiredRaces]) % 256;
  let faction: string | null = null;
  if (races & ALLIANCE_RACE_MASK && !(races & HORDE_RACE_MASK)) {
    faction = "ALLIANCE";
  }
  if (races & HORDE_RACE_MASK && !(races & ALLIANCE_RACE_MASK)) {
    faction = "HORDE";
  }
  return {
    id: questId,
    name: asText(row[QUEST_FIELDS.name], ""),
    requiredLevel: asNumber(row[QUEST_FIELDS.requiredLevel]),
    questLevel: asNumber(row[QUEST_FIELDS.questLevel]),
    zone: zoneName(zones, row[QUEST_FIELDS.zone]),
    faction: faction,
    classes: asNumber(row[QUEST_FIELDS.requiredClasses])
  };
}

function compareDropSources(first: NpcInfo, second: NpcInfo): number {
  if (second.rank !== first.rank) {
    return second.rank - first.rank;
  }
  return first.maxLevel - second.maxLevel;
}

function vendorFaction(vendors: NpcInfo[]): string | null {
  const sides = new Set<string>();
  for (const vendor of vendors) {
    if (vendor.friendlyTo === "A") {
      sides.add("ALLIANCE");
    } else if (vendor.friendlyTo === "H") {
      sides.add("HORDE");
    } else {
      sides.add("BOTH");
    }
  }
  if (sides.size === 1 && !sides.has("BOTH")) {
    return sides.values().next().value || null;
  }
  return null;
}

function firstSpawn(rawSpawns: CborValue | null, preferredZoneId: CborValue | undefined, zones: Zones): { zone: string; x: number | null; y: number | null } | null {
  const spawns = asKeyedTable(rawSpawns);
  if (spawns === null) {
    return null;
  }
  const zoneIds = Object.keys(spawns);
  if (zoneIds.length === 0) {
    return null;
  }
  let zoneId = zoneIds[0];
  if (typeof preferredZoneId === "number" && spawns[preferredZoneId] !== undefined) {
    zoneId = String(preferredZoneId);
  }
  const coordinates = asNumbers(asList(spawns[zoneId])[0]);
  if (coordinates.length < 2 || coordinates[0] < 0) {
    return { zone: zoneName(zones, Number(zoneId)), x: null, y: null };
  }
  return { zone: zoneName(zones, Number(zoneId)), x: coordinates[0], y: coordinates[1] };
}

function placeAt(kind: string, name: string, title: string, spawn: { zone: string; x: number | null; y: number | null } | null, fallbackZone: string): Place {
  const place: Place = { kind: kind, name: name, title: title, zone: fallbackZone, x: null, y: null };
  if (spawn !== null) {
    place.zone = spawn.zone || fallbackZone;
    place.x = spawn.x;
    place.y = spawn.y;
  }
  return place;
}

function npcLocation(reader: QuestieReader, zones: Zones, npcId: number): Place {
  const row = entityScalars(reader, "Npc", npcId);
  const spawn = firstSpawn(decodedTocValue(reader, "Npc-" + npcId + "-" + NPC_FIELDS.spawns), row[NPC_FIELDS.zone], zones);
  return placeAt("npc", asText(row[NPC_FIELDS.name], "Unknown creature"), asText(row[NPC_FIELDS.title], ""), spawn, zoneName(zones, row[NPC_FIELDS.zone]));
}

function objectLocation(reader: QuestieReader, zones: Zones, objectId: number): Place {
  const row = entityScalars(reader, "Object", objectId);
  const spawn = firstSpawn(decodedTocValue(reader, "Object-" + objectId + "-" + OBJECT_FIELDS.spawns), row[OBJECT_FIELDS.zone], zones);
  return placeAt("object", asText(row[OBJECT_FIELDS.name], "Object"), "", spawn, zoneName(zones, row[OBJECT_FIELDS.zone]));
}

function itemDetails(reader: QuestieReader, zones: Zones, itemId: number): QuestieItemDetail {
  const sources: ItemSource[] = [];
  const vendors: NpcInfo[] = [];
  for (const npcId of asNumbers(entityTable(reader, "Item", itemId, ITEM_FIELDS.vendors))) {
    const vendor = npcInfo(reader, zones, npcId);
    const place = npcLocation(reader, zones, npcId);
    vendors.push(vendor);
    sources.push({ type: "vendor", npcId: npcId, npc: vendor.name, title: vendor.title, zone: place.zone || vendor.zone, x: place.x, y: place.y, friendlyTo: vendor.friendlyTo });
  }
  const dropNpcIds = asNumbers(entityTable(reader, "Item", itemId, ITEM_FIELDS.npcDrops));
  if (dropNpcIds.length > WORLD_DROP_THRESHOLD) {
    sources.push({ type: "world-drop", count: dropNpcIds.length });
  } else {
    const drops: NpcInfo[] = [];
    for (const npcId of dropNpcIds) {
      drops.push(npcInfo(reader, zones, npcId));
    }
    drops.sort(compareDropSources);
    for (const drop of drops.slice(0, MAX_DROP_SOURCES)) {
      const place = npcLocation(reader, zones, drop.id);
      sources.push({ type: "drop", npcId: drop.id, npc: drop.name, zone: drop.zone, x: place.x, y: place.y, minLevel: drop.minLevel, maxLevel: drop.maxLevel, rank: drop.rank });
    }
    if (drops.length > MAX_DROP_SOURCES) {
      sources.push({ type: "more-drops", count: drops.length - MAX_DROP_SOURCES });
    }
  }
  for (const objectId of asNumbers(entityTable(reader, "Item", itemId, ITEM_FIELDS.objectDrops)).slice(0, MAX_DROP_SOURCES)) {
    const row = entityScalars(reader, "Object", objectId);
    sources.push({ type: "object", name: asText(row[OBJECT_FIELDS.name], "Container"), zone: zoneName(zones, row[OBJECT_FIELDS.zone]) });
  }
  const quests: QuestieQuest[] = [];
  for (const questId of asNumbers(entityTable(reader, "Item", itemId, ITEM_FIELDS.questRewards))) {
    quests.push(questInfo(reader, zones, questId));
  }
  return { sources: sources, quests: quests, vendorFaction: vendorFaction(vendors) };
}

function questStarter(reader: QuestieReader, zones: Zones, questId: number): Place | null {
  const startedBy = asList(decodedTocValue(reader, "Quest-" + questId + "-" + QUEST_FIELDS.startedBy));
  const creatures = asNumbers(startedBy[0]);
  if (creatures.length > 0) {
    return npcLocation(reader, zones, creatures[0]);
  }
  const objects = asNumbers(startedBy[1]);
  if (objects.length > 0) {
    return objectLocation(reader, zones, objects[0]);
  }
  const items = asNumbers(startedBy[2]);
  if (items.length > 0) {
    const item = entityScalars(reader, "Item", items[0]);
    return { kind: "item", name: asText(item[ITEM_NAME_FIELD], "an item"), title: "", zone: "", x: null, y: null };
  }
  return null;
}

function questPrerequisites(reader: QuestieReader, questId: number): number[] {
  const prerequisites = asNumbers(entityTable(reader, "Quest", questId, QUEST_FIELDS.preQuestGroup));
  const singles = asNumbers(entityTable(reader, "Quest", questId, QUEST_FIELDS.preQuestSingle));
  if (singles.length > 0) {
    prerequisites.push(singles[0]);
  }
  return prerequisites;
}

function collectChain(reader: QuestieReader, questId: number, ordered: number[], visiting: Set<number>): void {
  if (visiting.has(questId) || ordered.length >= MAX_CHAIN_LENGTH) {
    return;
  }
  visiting.add(questId);
  for (const prerequisite of questPrerequisites(reader, questId)) {
    collectChain(reader, prerequisite, ordered, visiting);
  }
  if (ordered.indexOf(questId) === -1) {
    ordered.push(questId);
  }
}

export function questStarterFor(details: QuestieDetails, questId: number): Place | null {
  if (!details.starterCache) {
    details.starterCache = new Map();
  }
  let starter = details.starterCache.get(questId);
  if (starter === undefined) {
    starter = questStarter(details.reader, details.zones, questId);
    details.starterCache.set(questId, starter);
  }
  return starter;
}

export function parseDungeonEntrances(text: string, zones: Zones): Record<string, { zone: string; x: number; y: number }> {
  const entrances: Record<string, { zone: string; x: number; y: number }> = {};
  const names: Record<string, string> = {};
  const entryPattern = /\[(\d+)\] = \{"((?:[^"\\]|\\.)+)",(?:\{[^}]*\}|nil),(\d+),\{\{(\d+),\s*([\d.]+),\s*([\d.]+)\}/g;
  let match = entryPattern.exec(text);
  while (match !== null) {
    names[match[1]] = match[2].replace(/\\(.)/g, "$1");
    entrances[names[match[1]]] = { zone: zoneName(zones, Number(match[4])), x: Number(match[5]), y: Number(match[6]) };
    match = entryPattern.exec(text);
  }
  const overridePattern = /dungeons\[(\d+)\]\[4\] = \{\{(\d+),\s*([\d.]+),\s*([\d.]+)\}/g;
  match = overridePattern.exec(text);
  while (match !== null) {
    if (names[match[1]]) {
      entrances[names[match[1]]] = { zone: zoneName(zones, Number(match[2])), x: Number(match[3]), y: Number(match[4]) };
    }
    match = overridePattern.exec(text);
  }
  return entrances;
}

export function questChain(details: QuestieDetails, questId: number): ChainStep[] {
  const ordered: number[] = [];
  collectChain(details.reader, questId, ordered, new Set());
  const steps: ChainStep[] = [];
  for (const chainQuestId of ordered) {
    steps.push(Object.assign(questInfo(details.reader, details.zones, chainQuestId), {
      starter: questStarter(details.reader, details.zones, chainQuestId),
      requiresAll: asNumbers(entityTable(details.reader, "Quest", chainQuestId, QUEST_FIELDS.preQuestGroup)),
      requiresAny: asNumbers(entityTable(details.reader, "Quest", chainQuestId, QUEST_FIELDS.preQuestSingle))
    }));
  }
  return steps;
}

export function buildQuestieDetails(text: string, itemIds: number[], zones: Zones, questIds: number[]): QuestieDetails {
  const index = indexToc(text);
  const reader: QuestieReader = { entries: index.entries, cache: new Map() };
  const items: Record<string, QuestieItemDetail> = {};
  for (const itemId of itemIds) {
    const itemDetail = itemDetails(reader, zones, itemId);
    if (itemDetail.sources.length > 0 || itemDetail.quests.length > 0) {
      items[itemId] = itemDetail;
    }
  }
  const quests: Record<string, QuestieQuest> = {};
  for (const questId of questIds || []) {
    if (index.entries.has("Quest-" + questId + "-S")) {
      quests[questId] = questInfo(reader, zones, questId);
    }
  }
  return { version: index.version, items: items, quests: quests, reader: reader, zones: zones };
}

function isPrerequisiteMet(questId: number, completed: Set<number>, stepIds: Set<number>): boolean {
  return completed.has(questId) || !stepIds.has(questId);
}

function isStepUnlocked(step: ChainStep, completed: Set<number>, stepIds: Set<number>): boolean {
  for (const questId of step.requiresAll) {
    if (!isPrerequisiteMet(questId, completed, stepIds)) {
      return false;
    }
  }
  if (step.requiresAny.length === 0) {
    return true;
  }
  for (const questId of step.requiresAny) {
    if (isPrerequisiteMet(questId, completed, stepIds)) {
      return true;
    }
  }
  return false;
}

export function availableSteps(steps: ChainStep[], completed: Set<number>): ChainStep[] {
  const stepIds = new Set<number>();
  for (const step of steps) {
    stepIds.add(step.id);
  }
  const available: ChainStep[] = [];
  for (const step of steps) {
    if (!completed.has(step.id) && isStepUnlocked(step, completed, stepIds)) {
      available.push(step);
    }
  }
  return available;
}

export const QUESTIE = {
  addonName: "QuestieDB",
  fileName: "QuestieDB_Forever.toc",
  dungeonFile: "support/Forever/Zones/dungeons.lua",
  buildDetails: buildQuestieDetails,
  questChain: questChain,
  availableSteps: availableSteps,
  questStarterFor: questStarterFor,
  parseDungeonEntrances: parseDungeonEntrances,
  decodeCbor: decodeCbor
};
