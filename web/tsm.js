const TSM_DATABASE_NAME = "foreverPlannerFiles";
const TSM_STORE_NAME = "handles";
const TSM_HANDLE_KEY = "tsmAppData";
const TSM_LINE_PATTERN = /LoadData\("([A-Z_]+)","([^"]+)",\[\[return (.*)\]\]\)/;
const TSM_FIELDS_PATTERN = /fields=\{([^}]*)\}/;
const TSM_DOWNLOAD_TIME_PATTERN = /downloadTime=(\d+)/;
const TSM_ROW_PATTERN = /\{([^{}]*)\}/g;
const TSM_REGION_SETS = ["AUCTIONDB_REGION_STAT", "AUCTIONDB_REGION_SALE", "AUCTIONDB_REGION_HISTORICAL"];
const TSM_LOCAL_SETS = ["AUCTIONDB_NON_COMMODITY_DATA", "AUCTIONDB_NON_COMMODITY_SCAN_STAT", "AUCTIONDB_NON_COMMODITY_HISTORICAL"];

function openHandleDatabase() {
  return new Promise(function executeOpen(resolve, reject) {
    const request = indexedDB.open(TSM_DATABASE_NAME, 1);
    request.onupgradeneeded = function createStore() {
      request.result.createObjectStore(TSM_STORE_NAME);
    };
    request.onsuccess = function openSucceeded() {
      resolve(request.result);
    };
    request.onerror = function openFailed() {
      reject(request.error);
    };
  });
}

async function storeTsmFileHandle(handle) {
  const database = await openHandleDatabase();
  return new Promise(function executeStore(resolve, reject) {
    const transaction = database.transaction(TSM_STORE_NAME, "readwrite");
    transaction.objectStore(TSM_STORE_NAME).put(handle, TSM_HANDLE_KEY);
    transaction.oncomplete = function storeSucceeded() {
      resolve();
    };
    transaction.onerror = function storeFailed() {
      reject(transaction.error);
    };
  });
}

async function loadTsmFileHandle() {
  const database = await openHandleDatabase();
  return new Promise(function executeLoad(resolve, reject) {
    const request = database.transaction(TSM_STORE_NAME).objectStore(TSM_STORE_NAME).get(TSM_HANDLE_KEY);
    request.onsuccess = function loadSucceeded() {
      resolve(request.result || null);
    };
    request.onerror = function loadFailed() {
      reject(request.error);
    };
  });
}

async function forgetTsmFileHandle() {
  const database = await openHandleDatabase();
  return new Promise(function executeDelete(resolve) {
    const transaction = database.transaction(TSM_STORE_NAME, "readwrite");
    transaction.objectStore(TSM_STORE_NAME).delete(TSM_HANDLE_KEY);
    transaction.oncomplete = function deleteSucceeded() {
      resolve();
    };
  });
}

function decodeTsmValue(rawValue) {
  return parseInt(rawValue, 32);
}

function tsmItemId(rawItemString) {
  const itemString = rawItemString.replace(/"/g, "");
  if (/^\d+$/.test(itemString)) {
    return Number(itemString);
  }
  const match = /^i:(\d+)$/.exec(itemString);
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
  for (const line of text.split("\n")) {
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
  for (const scope of localScopes) {
    if (scope.toLowerCase().endsWith("-" + factionName.toLowerCase())) {
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

async function readTsmPrices(handle, rulesetName, factionName) {
  const file = await handle.getFile();
  const text = await file.text();
  const sets = parseTsmAppData(text);
  if (sets.length === 0) {
    throw new Error("That file has no TSM price data. Pick AppData.lua from the TradeSkillMaster_AppHelper folder.");
  }
  const localScope = tsmScopeForCharacter(sets, rulesetName, factionName);
  return mergeTsmPrices(sets, localScope);
}

window.TSM = {
  storeFileHandle: storeTsmFileHandle,
  loadFileHandle: loadTsmFileHandle,
  forgetFileHandle: forgetTsmFileHandle,
  readPrices: readTsmPrices,
  parseAppData: parseTsmAppData
};
