const QUESTIE_ADDON_NAME = "QuestieDB";
const QUESTIE_FILE_NAME = "QuestieDB_Forever.toc";
const QUESTIE_KEY_PREFIX = "## X-";
const QUESTIE_CHUNK_PATTERN = /^~(\d+)~$/;
const QUESTIE_ENTITY_PREFIXES = ["Item-", "Npc-", "Object-", "Quest-"];
const ITEM_FIELDS = { npcDrops: 2, objectDrops: 3, questRewards: 6, vendors: 14 };
const NPC_FIELDS = { name: 1, minLevel: 4, maxLevel: 5, rank: 6, zone: 9, friendlyTo: 13, title: 14 };
const OBJECT_FIELDS = { name: 1, zone: 5 };
const QUEST_FIELDS = { name: 1, requiredLevel: 4, questLevel: 5, requiredRaces: 6, zone: 17 };
const ALLIANCE_RACE_MASK = 1 + 4 + 8 + 64;
const HORDE_RACE_MASK = 2 + 16 + 32 + 128;
const MAX_DROP_SOURCES = 3;
const WORLD_DROP_THRESHOLD = 12;
const utf8Decoder = new TextDecoder("utf-8");

function readCborArgument(cursor, additional) {
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

function readCborSimple(cursor, additional) {
  if (additional === 20) {
    return false;
  }
  if (additional === 21) {
    return true;
  }
  if (additional === 22 || additional === 23) {
    return null;
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

function readCborValue(cursor) {
  const initial = cursor.view.getUint8(cursor.offset);
  cursor.offset += 1;
  const majorType = initial >> 5;
  const additional = initial & 31;
  if (majorType === 7) {
    return readCborSimple(cursor, additional);
  }
  const argument = readCborArgument(cursor, additional);
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
    const list = [];
    for (let index = 0; index < argument; index += 1) {
      list.push(readCborValue(cursor));
    }
    return list;
  }
  if (majorType === 5) {
    const map = {};
    for (let index = 0; index < argument; index += 1) {
      const key = readCborValue(cursor);
      map[key] = readCborValue(cursor);
    }
    return map;
  }
  throw new Error("Unsupported CBOR major type " + majorType);
}

function decodeCbor(bytes) {
  const cursor = {
    bytes: bytes,
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    offset: 0
  };
  return readCborValue(cursor);
}

function base64Bytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isEntityKey(key) {
  for (const prefix of QUESTIE_ENTITY_PREFIXES) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function indexToc(text) {
  const entries = new Map();
  let version = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("## Version: ")) {
      version = line.slice("## Version: ".length).trim();
      continue;
    }
    if (!line.startsWith(QUESTIE_KEY_PREFIX)) {
      continue;
    }
    const separator = line.indexOf(": ");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(QUESTIE_KEY_PREFIX.length, separator);
    if (isEntityKey(key)) {
      entries.set(key, line.slice(separator + 2).trim());
    }
  }
  return { entries: entries, version: version };
}

function createReader(index) {
  return { entries: index.entries, cache: new Map() };
}

function rawTocValue(reader, key) {
  const value = reader.entries.get(key);
  if (value === undefined) {
    return null;
  }
  const chunkMatch = QUESTIE_CHUNK_PATTERN.exec(value);
  if (chunkMatch === null) {
    return value;
  }
  let combined = "";
  for (let part = 1; part <= Number(chunkMatch[1]); part += 1) {
    combined += reader.entries.get(key + "-" + part) || "";
  }
  return combined;
}

function decodedTocValue(reader, key) {
  if (reader.cache.has(key)) {
    return reader.cache.get(key);
  }
  const raw = rawTocValue(reader, key);
  let value = null;
  if (raw !== null) {
    value = decodeCbor(base64Bytes(raw));
  }
  reader.cache.set(key, value);
  return value;
}

function entityScalars(reader, entityType, entityId) {
  return decodedTocValue(reader, entityType + "-" + entityId + "-S") || {};
}

function entityTable(reader, entityType, entityId, fieldIndex) {
  return decodedTocValue(reader, entityType + "-" + entityId + "-" + fieldIndex) || [];
}

function zoneName(zones, zoneId) {
  if (zoneId && zones[zoneId]) {
    return zones[zoneId];
  }
  return "";
}

function npcInfo(reader, zones, npcId) {
  const row = entityScalars(reader, "Npc", npcId);
  return {
    id: npcId,
    name: row[NPC_FIELDS.name] || "Unknown creature",
    title: row[NPC_FIELDS.title] || "",
    minLevel: row[NPC_FIELDS.minLevel] || 0,
    maxLevel: row[NPC_FIELDS.maxLevel] || 0,
    rank: row[NPC_FIELDS.rank] || 0,
    zone: zoneName(zones, row[NPC_FIELDS.zone]),
    friendlyTo: row[NPC_FIELDS.friendlyTo] || ""
  };
}

function questInfo(reader, zones, questId) {
  const row = entityScalars(reader, "Quest", questId);
  const races = row[QUEST_FIELDS.requiredRaces] || 0;
  let faction = null;
  if (races % 256 & ALLIANCE_RACE_MASK && !(races % 256 & HORDE_RACE_MASK)) {
    faction = "ALLIANCE";
  }
  if (races % 256 & HORDE_RACE_MASK && !(races % 256 & ALLIANCE_RACE_MASK)) {
    faction = "HORDE";
  }
  return {
    id: questId,
    name: row[QUEST_FIELDS.name] || "",
    requiredLevel: row[QUEST_FIELDS.requiredLevel] || 0,
    questLevel: row[QUEST_FIELDS.questLevel] || 0,
    zone: zoneName(zones, row[QUEST_FIELDS.zone]),
    faction: faction
  };
}

function compareDropSources(first, second) {
  if (second.rank !== first.rank) {
    return second.rank - first.rank;
  }
  return first.maxLevel - second.maxLevel;
}

function vendorFaction(vendors) {
  const sides = new Set();
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
    return sides.values().next().value;
  }
  return null;
}

function itemDetails(reader, zones, itemId) {
  const sources = [];
  const vendors = [];
  for (const npcId of entityTable(reader, "Item", itemId, ITEM_FIELDS.vendors)) {
    const vendor = npcInfo(reader, zones, npcId);
    vendors.push(vendor);
    sources.push({ type: "vendor", npc: vendor.name, title: vendor.title, zone: vendor.zone, friendlyTo: vendor.friendlyTo });
  }

  const dropNpcIds = entityTable(reader, "Item", itemId, ITEM_FIELDS.npcDrops);
  if (dropNpcIds.length > WORLD_DROP_THRESHOLD) {
    sources.push({ type: "world-drop", count: dropNpcIds.length });
  } else {
    const drops = [];
    for (const npcId of dropNpcIds) {
      drops.push(npcInfo(reader, zones, npcId));
    }
    drops.sort(compareDropSources);
    for (const drop of drops.slice(0, MAX_DROP_SOURCES)) {
      sources.push({ type: "drop", npc: drop.name, zone: drop.zone, minLevel: drop.minLevel, maxLevel: drop.maxLevel, rank: drop.rank });
    }
    if (drops.length > MAX_DROP_SOURCES) {
      sources.push({ type: "more-drops", count: drops.length - MAX_DROP_SOURCES });
    }
  }

  for (const objectId of entityTable(reader, "Item", itemId, ITEM_FIELDS.objectDrops).slice(0, MAX_DROP_SOURCES)) {
    const row = entityScalars(reader, "Object", objectId);
    sources.push({ type: "object", name: row[OBJECT_FIELDS.name] || "Container", zone: zoneName(zones, row[OBJECT_FIELDS.zone]) });
  }

  const quests = [];
  for (const questId of entityTable(reader, "Item", itemId, ITEM_FIELDS.questRewards)) {
    quests.push(questInfo(reader, zones, questId));
  }
  return { sources: sources, quests: quests, vendorFaction: vendorFaction(vendors) };
}

function buildQuestieDetails(text, itemIds, zones) {
  const index = indexToc(text);
  const reader = createReader(index);
  const details = {};
  for (const itemId of itemIds) {
    const itemDetail = itemDetails(reader, zones, itemId);
    if (itemDetail.sources.length > 0 || itemDetail.quests.length > 0) {
      details[itemId] = itemDetail;
    }
  }
  return { version: index.version, items: details };
}

window.QUESTIE = {
  addonName: QUESTIE_ADDON_NAME,
  fileName: QUESTIE_FILE_NAME,
  buildDetails: buildQuestieDetails,
  decodeCbor: decodeCbor
};
