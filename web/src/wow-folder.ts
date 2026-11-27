const HANDLE_DATABASE_NAME = "foreverPlannerFiles";
const HANDLE_STORE_NAME = "handles";
const FOREVER_FOLDER_NAME = "_forever_";

export const WOW_FOLDER_KEY = "wowFolder";
export const LEGACY_TSM_FILE_KEY = "tsmAppData";

interface PermissionHandle {
  queryPermission(options: { mode: string }): Promise<string>;
  requestPermission(options: { mode: string }): Promise<string>;
}

export interface FileContents {
  text: string;
  modifiedAt: number;
}

export interface AccountFile extends FileContents {
  account: string;
}

function openHandleDatabase(): Promise<IDBDatabase> {
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

export async function storeHandle(key: string, handle: FileSystemHandle): Promise<void> {
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

export async function loadHandle(key: string): Promise<FileSystemDirectoryHandle | FileSystemFileHandle | null> {
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

export async function forgetHandle(key: string): Promise<void> {
  const database = await openHandleDatabase();
  return new Promise(function executeDelete(resolve) {
    const transaction = database.transaction(HANDLE_STORE_NAME, "readwrite");
    transaction.objectStore(HANDLE_STORE_NAME).delete(key);
    transaction.oncomplete = function deleteSucceeded() {
      resolve();
    };
  });
}

export async function ensureReadPermission(handle: FileSystemHandle, askPermission: boolean): Promise<boolean> {
  const permissionHandle = handle as unknown as PermissionHandle;
  let permission = await permissionHandle.queryPermission({ mode: "read" });
  if (permission !== "granted" && askPermission) {
    permission = await permissionHandle.requestPermission({ mode: "read" });
  }
  return permission === "granted";
}

async function childDirectory(directoryHandle: FileSystemDirectoryHandle | null, name: string): Promise<FileSystemDirectoryHandle | null> {
  if (directoryHandle === null) {
    return null;
  }
  try {
    return await directoryHandle.getDirectoryHandle(name);
  } catch (error) {
    return null;
  }
}

export async function addonsDirectory(rootHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
  const candidates = [rootHandle];
  const foreverFolder = await childDirectory(rootHandle, FOREVER_FOLDER_NAME);
  if (foreverFolder !== null) {
    candidates.unshift(foreverFolder);
  }
  for (const candidate of candidates) {
    const addons = await childDirectory(await childDirectory(candidate, "Interface"), "AddOns");
    if (addons !== null) {
      return addons;
    }
  }
  if (rootHandle.name === "AddOns") {
    return rootHandle;
  }
  return null;
}

async function gameDirectory(rootHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
  const foreverFolder = await childDirectory(rootHandle, FOREVER_FOLDER_NAME);
  if (foreverFolder !== null) {
    return foreverFolder;
  }
  if ((await childDirectory(rootHandle, "WTF")) !== null) {
    return rootHandle;
  }
  return null;
}

async function readFile(directory: FileSystemDirectoryHandle, fileName: string): Promise<FileContents | null> {
  try {
    const fileHandle = await directory.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return { text: await file.text(), modifiedAt: file.lastModified };
  } catch (error) {
    return null;
  }
}

export async function readSavedVariablesFiles(rootHandle: FileSystemDirectoryHandle, fileName: string): Promise<AccountFile[]> {
  const game = await gameDirectory(rootHandle);
  if (game === null) {
    return [];
  }
  const accounts = await childDirectory(await childDirectory(game, "WTF"), "Account");
  if (accounts === null) {
    return [];
  }
  const files: AccountFile[] = [];
  for await (const entry of accounts.values()) {
    if (entry.kind !== "directory") {
      continue;
    }
    const savedVariables = await childDirectory(entry as FileSystemDirectoryHandle, "SavedVariables");
    if (savedVariables === null) {
      continue;
    }
    const contents = await readFile(savedVariables, fileName);
    if (contents !== null) {
      files.push({ account: entry.name, text: contents.text, modifiedAt: contents.modifiedAt });
    }
  }
  return files;
}

export async function readAddonFile(rootHandle: FileSystemDirectoryHandle, addonName: string, fileName: string): Promise<FileContents | null> {
  const addons = await addonsDirectory(rootHandle);
  if (addons === null) {
    return null;
  }
  let directory = await childDirectory(addons, addonName);
  const pathParts = fileName.split("/");
  const baseName = pathParts.pop() as string;
  for (const part of pathParts) {
    directory = await childDirectory(directory, part);
  }
  if (directory === null) {
    return null;
  }
  return readFile(directory, baseName);
}

export const WOW_FOLDER = {
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
