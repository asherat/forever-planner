const HANDLE_DATABASE_NAME = "foreverPlannerFiles";
const HANDLE_STORE_NAME = "handles";
const WOW_FOLDER_KEY = "wowFolder";
const LEGACY_TSM_FILE_KEY = "tsmAppData";
const FOREVER_FOLDER_NAME = "_forever_";

function openHandleDatabase() {
  return new Promise(function executeOpen(resolve, reject) {
    const request = indexedDB.open(HANDLE_DATABASE_NAME, 1);
    request.onupgradeneeded = function createStore() {
      request.result.createObjectStore(HANDLE_STORE_NAME);
    };
    request.onsuccess = function openSucceeded() {
      resolve(request.result);
    };
    request.onerror = function openFailed() {
      reject(request.error);
    };
  });
}

async function storeHandle(key, handle) {
  const database = await openHandleDatabase();
  return new Promise(function executeStore(resolve, reject) {
    const transaction = database.transaction(HANDLE_STORE_NAME, "readwrite");
    transaction.objectStore(HANDLE_STORE_NAME).put(handle, key);
    transaction.oncomplete = function storeSucceeded() {
      resolve();
    };
    transaction.onerror = function storeFailed() {
      reject(transaction.error);
    };
  });
}

async function loadHandle(key) {
  const database = await openHandleDatabase();
  return new Promise(function executeLoad(resolve, reject) {
    const request = database.transaction(HANDLE_STORE_NAME).objectStore(HANDLE_STORE_NAME).get(key);
    request.onsuccess = function loadSucceeded() {
      resolve(request.result || null);
    };
    request.onerror = function loadFailed() {
      reject(request.error);
    };
  });
}

async function forgetHandle(key) {
  const database = await openHandleDatabase();
  return new Promise(function executeDelete(resolve) {
    const transaction = database.transaction(HANDLE_STORE_NAME, "readwrite");
    transaction.objectStore(HANDLE_STORE_NAME).delete(key);
    transaction.oncomplete = function deleteSucceeded() {
      resolve();
    };
  });
}

async function ensureReadPermission(handle, askPermission) {
  let permission = await handle.queryPermission({ mode: "read" });
  if (permission !== "granted" && askPermission) {
    permission = await handle.requestPermission({ mode: "read" });
  }
  return permission === "granted";
}

async function childDirectory(directoryHandle, name) {
  if (directoryHandle === null) {
    return null;
  }
  try {
    return await directoryHandle.getDirectoryHandle(name);
  } catch (error) {
    return null;
  }
}

async function addonsDirectory(rootHandle) {
  const candidates = [rootHandle];
  const foreverFolder = await childDirectory(rootHandle, FOREVER_FOLDER_NAME);
  if (foreverFolder !== null) {
    candidates.unshift(foreverFolder);
  }
  for (const candidate of candidates) {
    const interfaceFolder = await childDirectory(candidate, "Interface");
    if (interfaceFolder !== null) {
      const addons = await childDirectory(interfaceFolder, "AddOns");
      if (addons !== null) {
        return addons;
      }
    }
  }
  if (rootHandle.name === "AddOns") {
    return rootHandle;
  }
  return null;
}

async function gameDirectory(rootHandle) {
  const foreverFolder = await childDirectory(rootHandle, FOREVER_FOLDER_NAME);
  if (foreverFolder !== null) {
    return foreverFolder;
  }
  if ((await childDirectory(rootHandle, "WTF")) !== null) {
    return rootHandle;
  }
  return null;
}

async function readSavedVariablesFiles(rootHandle, fileName) {
  const game = await gameDirectory(rootHandle);
  if (game === null) {
    return [];
  }
  const wtf = await childDirectory(game, "WTF");
  const accounts = await childDirectory(wtf, "Account");
  if (accounts === null) {
    return [];
  }
  const files = [];
  for await (const entry of accounts.values()) {
    if (entry.kind !== "directory") {
      continue;
    }
    const savedVariables = await childDirectory(entry, "SavedVariables");
    if (savedVariables === null) {
      continue;
    }
    try {
      const fileHandle = await savedVariables.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      files.push({ account: entry.name, text: await file.text(), modifiedAt: file.lastModified });
    } catch (error) {
      continue;
    }
  }
  return files;
}

async function readAddonFile(rootHandle, addonName, fileName) {
  const addons = await addonsDirectory(rootHandle);
  if (addons === null) {
    return null;
  }
  let directory = await childDirectory(addons, addonName);
  const pathParts = fileName.split("/");
  const baseName = pathParts.pop();
  for (const part of pathParts) {
    directory = await childDirectory(directory, part);
  }
  if (directory === null) {
    return null;
  }
  try {
    const fileHandle = await directory.getFileHandle(baseName);
    const file = await fileHandle.getFile();
    return { text: await file.text(), modifiedAt: file.lastModified };
  } catch (error) {
    return null;
  }
}

window.WOW_FOLDER = {
  folderKey: WOW_FOLDER_KEY,
  legacyTsmFileKey: LEGACY_TSM_FILE_KEY,
  storeHandle: storeHandle,
  loadHandle: loadHandle,
  forgetHandle: forgetHandle,
  ensureReadPermission: ensureReadPermission,
  addonsDirectory: addonsDirectory,
  readAddonFile: readAddonFile,
  readSavedVariablesFiles: readSavedVariablesFiles
};
