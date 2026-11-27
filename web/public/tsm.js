const TSM_LINE_PATTERN = /LoadData\("([A-Z_]+)","([^"]+)",\[\[return (.*)\]\]\)/;
const TSM_FIELDS_PATTERN = /fields=\{([^}]*)\}/;
const TSM_DOWNLOAD_TIME_PATTERN = /downloadTime=(\d+)/;
const TSM_ROW_PATTERN = /\{([^{}]*)\}/g;
const TSM_REGION_SETS = ["AUCTIONDB_REGION_STAT", "AUCTIONDB_REGION_SALE", "AUCTIONDB_REGION_HISTORICAL"];
const TSM_LOCAL_SETS = ["AUCTIONDB_NON_COMMODITY_DATA", "AUCTIONDB_NON_COMMODITY_SCAN_STAT", "AUCTIONDB_NON_COMMODITY_HISTORICAL"];

function decodeTsmValue(rawValue) {
  return parseInt(rawValue, 32);
}

function tsmItemId(rawItemString) {
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

function parseTsmLine(line) {
  const lineMatch = TSM_LINE_PATTERN.exec(line);
  if (lineMatch === null) {
    return null;
  }
  const body = lineMatch[3];
  const fieldsMatch = TSM_FIELDS_PATTERN.exec(body);
  if (fieldsMatch === null) {
    return null;
  }
  const fields = fieldsMatch[1].replace(/"/g, "").split(",");
  const dataStart = body.indexOf("data={");
  const rows = {};
  if (dataStart !== -1) {
    const dataText = body.slice(dataStart + "data={".length);
    TSM_ROW_PATTERN.lastIndex = 0;
    let rowMatch = TSM_ROW_PATTERN.exec(dataText);
    while (rowMatch !== null) {
      const values = rowMatch[1].split(",");
      const itemId = tsmItemId(values[0]);
      if (itemId !== null) {
        const row = {};
        for (let fieldIndex = 1; fieldIndex < fields.length; fieldIndex += 1) {
          row[fields[fieldIndex]] = decodeTsmValue(values[fieldIndex]);
        }
        rows[itemId] = row;
      }
      rowMatch = TSM_ROW_PATTERN.exec(dataText);
    }
  }
  let downloadTime = 0;
  const downloadTimeMatch = TSM_DOWNLOAD_TIME_PATTERN.exec(body);
  if (downloadTimeMatch !== null) {
    downloadTime = Number(downloadTimeMatch[1]) * 1000;
  }
  return { setName: lineMatch[1], scope: lineMatch[2], downloadTime: downloadTime, rows: rows };
}

function parseTsmAppData(text) {
  const sets = [];
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseTsmLine(line);
    if (parsed !== null) {
      sets.push(parsed);
    }
  }
  return sets;
}

function tsmScopeForCharacter(sets, rulesetName, factionName) {
  const wanted = (rulesetName + "-" + factionName).toLowerCase();
  const localScopes = new Set();
  for (const set of sets) {
    if (TSM_LOCAL_SETS.indexOf(set.setName) !== -1) {
      localScopes.add(set.scope);
    }
  }
  for (const scope of localScopes) {
    if (scope.toLowerCase() === wanted) {
      return scope;
    }
  }
  return null;
}

function mergeTsmPrices(sets, localScope) {
  const prices = {};
  let newestDownload = 0;
  for (const set of sets) {
    const isRegionSet = TSM_REGION_SETS.indexOf(set.setName) !== -1;
    const isLocalSet = TSM_LOCAL_SETS.indexOf(set.setName) !== -1 && set.scope === localScope;
    if (!isRegionSet && !isLocalSet) {
      continue;
    }
    if (set.downloadTime > newestDownload) {
      newestDownload = set.downloadTime;
    }
    for (const itemId of Object.keys(set.rows)) {
      if (!prices[itemId]) {
        prices[itemId] = {};
      }
      Object.assign(prices[itemId], set.rows[itemId]);
    }
  }
  return { prices: prices, scope: localScope, downloadedAt: newestDownload };
}

function readTsmPrices(text, rulesetName, factionName) {
  const sets = parseTsmAppData(text);
  if (sets.length === 0) {
    throw new Error("That file has no TSM price data. Pick AppData.lua from the TradeSkillMaster_AppHelper folder.");
  }
  const localScope = tsmScopeForCharacter(sets, rulesetName, factionName);
  return mergeTsmPrices(sets, localScope);
}

const TSM_INVENTORY_LINE_PATTERN = /^\s*\["s@(.+?) - (Horde|Alliance) - (.+?)@internalData@(\w+)"\] = (.*)$/;
const TSM_INVENTORY_FIELDS = ["bagQuantity", "bankQuantity", "mailQuantity", "auctionQuantity", "money", "playerProfessions", "classKey"];

function skipLuaWhitespace(cursor) {
  while (cursor.offset < cursor.text.length) {
    if (/\s/.test(cursor.text[cursor.offset])) {
      cursor.offset += 1;
    } else if (cursor.text.startsWith("--", cursor.offset)) {
      const lineEnd = cursor.text.indexOf("\n", cursor.offset);
      if (lineEnd === -1) {
        cursor.offset = cursor.text.length;
      } else {
        cursor.offset = lineEnd + 1;
      }
    } else {
      break;
    }
  }
}

function readLuaString(cursor) {
  const quote = cursor.text[cursor.offset];
  cursor.offset += 1;
  let value = "";
  while (cursor.offset < cursor.text.length && cursor.text[cursor.offset] !== quote) {
    if (cursor.text[cursor.offset] === "\\") {
      cursor.offset += 1;
    }
    value += cursor.text[cursor.offset];
    cursor.offset += 1;
  }
  cursor.offset += 1;
  return value;
}

function readLuaWord(cursor) {
  const match = /^[A-Za-z0-9_.+-]+/.exec(cursor.text.slice(cursor.offset, cursor.offset + 64));
  cursor.offset += match[0].length;
  const word = match[0];
  if (word === "true") {
    return true;
  }
  if (word === "false") {
    return false;
  }
  if (word === "nil") {
    return null;
  }
  if (/^-?\d/.test(word)) {
    return Number(word);
  }
  return word;
}

function readLuaTable(cursor) {
  cursor.offset += 1;
  const table = {};
  let nextIndex = 1;
  skipLuaWhitespace(cursor);
  while (cursor.text[cursor.offset] !== "}") {
    let key = null;
    if (cursor.text[cursor.offset] === "[") {
      cursor.offset += 1;
      skipLuaWhitespace(cursor);
      key = readLuaValue(cursor);
      skipLuaWhitespace(cursor);
      cursor.offset += 1;
      skipLuaWhitespace(cursor);
      cursor.offset += 1;
    } else {
      const start = cursor.offset;
      const word = /^[A-Za-z_][A-Za-z0-9_]*\s*=/.exec(cursor.text.slice(start, start + 64));
      if (word !== null && cursor.text[start] !== "{") {
        key = word[0].replace(/\s*=$/, "");
        cursor.offset += word[0].length;
      }
    }
    skipLuaWhitespace(cursor);
    const value = readLuaValue(cursor);
    if (key === null) {
      key = nextIndex;
      nextIndex += 1;
    }
    table[key] = value;
    skipLuaWhitespace(cursor);
    if (cursor.text[cursor.offset] === "," || cursor.text[cursor.offset] === ";") {
      cursor.offset += 1;
    }
    skipLuaWhitespace(cursor);
  }
  cursor.offset += 1;
  return table;
}

function readLuaValue(cursor) {
  skipLuaWhitespace(cursor);
  const character = cursor.text[cursor.offset];
  if (character === "{") {
    return readLuaTable(cursor);
  }
  if (character === "\"" || character === "'") {
    return readLuaString(cursor);
  }
  return readLuaWord(cursor);
}

function parseLuaValue(text) {
  return readLuaValue({ text: text, offset: 0 });
}

function braceBalance(line) {
  let balance = 0;
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\") {
      index += 1;
    } else if (character === "\"") {
      inString = !inString;
    } else if (!inString && character === "{") {
      balance += 1;
    } else if (!inString && character === "}") {
      balance -= 1;
    }
  }
  return balance;
}

function itemCounts(table) {
  const counts = {};
  for (const itemString of Object.keys(table || {})) {
    const itemId = tsmItemId(itemString);
    if (itemId !== null) {
      counts[itemId] = (counts[itemId] || 0) + table[itemString];
    }
  }
  return counts;
}

function professionList(table) {
  const professions = [];
  for (const name of Object.keys(table || {})) {
    const entry = table[name];
    let level = 0;
    let maxLevel = 0;
    if (entry !== null && typeof entry === "object") {
      level = entry.level || entry.skillLevel || 0;
      maxLevel = entry.maxLevel || entry.skillMaxLevel || 0;
    }
    professions.push({ name: name, level: level, maxLevel: maxLevel });
  }
  return professions;
}

function emptyInventoryCharacter(name, faction, ruleset) {
  return { name: name, faction: faction, ruleset: ruleset, bags: {}, bank: {}, mail: {}, auctions: {}, money: 0, professions: [], classKey: "" };
}

function storeInventoryField(character, fieldName, value) {
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

function parseTsmInventory(text) {
  const characters = {};
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = TSM_INVENTORY_LINE_PATTERN.exec(lines[index]);
    if (match === null || TSM_INVENTORY_FIELDS.indexOf(match[4]) === -1) {
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
      characters[name] = emptyInventoryCharacter(name, match[2], match[3]);
    }
    try {
      storeInventoryField(characters[name], match[4], parseLuaValue(valueText.replace(/,\s*$/, "")));
    } catch (error) {
      continue;
    }
  }
  return characters;
}

window.TSM = {
  addonName: "TradeSkillMaster_AppHelper",
  fileName: "AppData.lua",
  readPrices: readTsmPrices,
  savedVariablesFile: "TradeSkillMaster.lua",
  parseInventory: parseTsmInventory,
  parseAppData: parseTsmAppData
};
