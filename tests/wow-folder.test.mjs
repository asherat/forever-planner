import test from "node:test";
import assert from "node:assert/strict";
import { addonsDirectory, readAddonFile, readSavedVariablesFiles } from "../web/src/wow-folder.ts";

function notFound() {
  const error = new Error("not found");
  error.name = "NotFoundError";
  return error;
}

function file(text) {
  return { kind: "file", text: text };
}

function folder(name, children) {
  return {
    kind: "directory",
    name: name,
    async getDirectoryHandle(childName) {
      const child = children[childName];
      if (!child || child.kind !== "directory") {
        throw notFound();
      }
      return child;
    },
    async getFileHandle(childName) {
      const child = children[childName];
      if (!child || child.kind !== "file") {
        throw notFound();
      }
      return { async getFile() { return { lastModified: 1700000000000, async text() { return child.text; } }; } };
    },
    async *values() {
      for (const childName of Object.keys(children)) {
        const child = children[childName];
        if (child.kind === "directory") {
          yield child;
        } else {
          yield { kind: "file", name: childName };
        }
      }
    }
  };
}

function gameFolder(name) {
  return folder(name, {
    Interface: folder("Interface", {
      AddOns: folder("AddOns", {
        QuestieDB: folder("QuestieDB", {
          "QuestieDB_Forever.toc": file("toc text"),
          support: folder("support", { Forever: folder("Forever", { Zones: folder("Zones", { "dungeons.lua": file("dungeons text") }) }) })
        })
      })
    }),
    WTF: folder("WTF", {
      Account: folder("Account", {
        "123456#1": folder("123456#1", { SavedVariables: folder("SavedVariables", { "TradeSkillMaster.lua": file("first account") }) }),
        "789#1": folder("789#1", { SavedVariables: folder("SavedVariables", {}) }),
        "SavedVariables.txt": file("not an account")
      })
    })
  });
}

test("finds AddOns in the World of Warcraft folder, the _forever_ folder or AddOns itself", async () => {
  const forever = gameFolder("_forever_");
  assert.equal((await addonsDirectory(folder("World of Warcraft", { _forever_: forever }))).name, "AddOns");
  assert.equal((await addonsDirectory(forever)).name, "AddOns");
  assert.equal((await addonsDirectory(folder("AddOns", {}))).name, "AddOns");
  assert.equal(await addonsDirectory(folder("Desktop", {})), null);
});

test("reads an addon file, also from a subfolder", async () => {
  const root = folder("World of Warcraft", { _forever_: gameFolder("_forever_") });
  assert.deepEqual(await readAddonFile(root, "QuestieDB", "QuestieDB_Forever.toc"), { text: "toc text", modifiedAt: 1700000000000 });
  assert.equal((await readAddonFile(root, "QuestieDB", "support/Forever/Zones/dungeons.lua")).text, "dungeons text");
  assert.equal(await readAddonFile(root, "QuestieDB", "support/Nowhere/dungeons.lua"), null);
  assert.equal(await readAddonFile(root, "TradeSkillMaster", "AppData.lua"), null);
});

test("reads a saved-variables file from every account that has one", async () => {
  const files = await readSavedVariablesFiles(gameFolder("_forever_"), "TradeSkillMaster.lua");
  assert.deepEqual(files, [{ account: "123456#1", text: "first account", modifiedAt: 1700000000000 }]);
  assert.deepEqual(await readSavedVariablesFiles(folder("Desktop", {}), "TradeSkillMaster.lua"), []);
});
