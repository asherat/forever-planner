import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { QUESTIE as questie } from "../web/src/questie.ts";

const { encodeBase64 } = createRequire(import.meta.url)("./helpers/cbor.js");
const zones = { 17: "The Barrens", 1176: "Zul'Farrak", 440: "Tanaris" };
const ALLIANCE_RACES = 77;
const HORDE_RACES = 178;
const SHAMAN = 64;

function tocLine(key, value) {
  return "## X-" + key + ": " + value;
}

function buildToc(lines) {
  return ["## Interface: 16001", "## Version: 9.9.9"].concat(lines).join("\r\n");
}

test("decodes CBOR maps, arrays, strings and integers", () => {
  const bytes = Uint8Array.from(Buffer.from(encodeBase64({ 1: "Legionnaire's Band", 9: 53, 2: [14754, 300] }), "base64"));
  const decoded = questie.decodeCbor(bytes);
  assert.equal(decoded[1], "Legionnaire's Band");
  assert.equal(decoded[9], 53);
  assert.deepEqual(Array.from(decoded[2]), [14754, 300]);
});

test("lists vendors with their friendliness and derives a vendor-only faction", () => {
  const toc = buildToc([
    tocLine("Item-100-S", encodeBase64({ 1: "Test Band" })),
    tocLine("Item-100-14", encodeBase64([14754])),
    tocLine("Npc-14754-S", encodeBase64({ 1: "Kelm Hargunth", 9: 17, 13: "H", 14: "Warsong Supply Officer" }))
  ]);
  const details = questie.buildDetails(toc, [100], zones, []);
  const item = details.items[100];
  assert.equal(details.version, "9.9.9");
  assert.equal(item.sources[0].type, "vendor");
  assert.equal(item.sources[0].npc, "Kelm Hargunth");
  assert.equal(item.sources[0].npcId, 14754);
  assert.equal(item.sources[0].zone, "The Barrens");
  assert.equal(item.vendorFaction, "HORDE");
});

test("puts bosses first among drops and summarises long drop lists as a world drop", () => {
  const dropLines = [tocLine("Item-200-2", encodeBase64([1, 2]))];
  dropLines.push(tocLine("Npc-1-S", encodeBase64({ 1: "Trash Mob", 4: 44, 5: 45, 9: 1176 })));
  dropLines.push(tocLine("Npc-2-S", encodeBase64({ 1: "Chief Ukorz", 4: 48, 5: 48, 6: 3, 9: 1176 })));
  const worldIds = [];
  for (let index = 10; index < 30; index += 1) {
    worldIds.push(index);
  }
  dropLines.push(tocLine("Item-300-2", encodeBase64(worldIds)));
  const details = questie.buildDetails(buildToc(dropLines), [200, 300], zones, []);
  assert.equal(details.items[200].sources[0].npc, "Chief Ukorz");
  assert.equal(details.items[200].sources[0].npcId, 2);
  assert.equal(details.items[200].sources[0].zone, "Zul'Farrak");
  assert.equal(details.items[300].sources[0].type, "world-drop");
  assert.equal(details.items[300].sources[0].count, 20);
});

test("reads quest level, faction and class restrictions", () => {
  const toc = buildToc([
    tocLine("Quest-500-S", encodeBase64({ 1: "Alliance Quest", 4: 30, 5: 35, 6: ALLIANCE_RACES, 17: 17 })),
    tocLine("Quest-501-S", encodeBase64({ 1: "Shaman Quest", 4: 38, 5: 40, 6: HORDE_RACES, 7: SHAMAN, 17: 440 }))
  ]);
  const details = questie.buildDetails(toc, [], zones, [500, 501, 999]);
  assert.equal(details.quests[500].faction, "ALLIANCE");
  assert.equal(details.quests[500].questLevel, 35);
  assert.equal(details.quests[501].faction, "HORDE");
  assert.equal(details.quests[501].classes, SHAMAN);
  assert.equal(details.quests[501].zone, "Tanaris");
  assert.equal(details.quests[999], undefined);
});

test("joins values split into numbered chunks", () => {
  const encoded = encodeBase64({ 1: "A fairly long item name used to test chunking" });
  const half = Math.floor(encoded.length / 2);
  const toc = buildToc([
    tocLine("Item-700-S", "~2~"),
    tocLine("Item-700-S-1", encoded.slice(0, half)),
    tocLine("Item-700-S-2", encoded.slice(half)),
    tocLine("Item-700-14", encodeBase64([1])),
    tocLine("Npc-1-S", encodeBase64({ 1: "Vendor", 13: "AH" }))
  ]);
  const details = questie.buildDetails(toc, [700], zones, []);
  assert.equal(details.items[700].sources[0].npc, "Vendor");
});

test("decodes half-precision floats used for coordinates", () => {
  assert.equal(questie.decodeCbor(Uint8Array.from([0xf9, 0x3e, 0x00])), 1.5);
  assert.equal(questie.decodeCbor(Uint8Array.from([0xf9, 0xc0, 0x00])), -2);
});

test("orders a quest chain from its first step and finds each quest giver", () => {
  const toc = buildToc([
    tocLine("Quest-1-S", encodeBase64({ 1: "First Step", 5: 40, 17: 17 })),
    tocLine("Quest-1-2", encodeBase64([[10]])),
    tocLine("Quest-2-S", encodeBase64({ 1: "Second Step", 5: 41, 17: 17 })),
    tocLine("Quest-2-13", encodeBase64([1])),
    tocLine("Quest-2-2", encodeBase64([[10]])),
    tocLine("Npc-10-S", encodeBase64({ 1: "Quest Giver", 9: 17, 14: "Fight Promoter" })),
    tocLine("Npc-10-7", encodeBase64({ 17: [[65, 21]] }))
  ]);
  const details = questie.buildDetails(toc, [], zones, []);
  const chain = questie.questChain(details, 2);
  assert.deepEqual([chain[0].name, chain[1].name], ["First Step", "Second Step"]);
  assert.equal(chain[1].starter.name, "Quest Giver");
  assert.equal(chain[1].starter.zone, "The Barrens");
  assert.equal(chain[1].starter.x, 65);
  assert.equal(chain[1].starter.y, 21);
});

test("reads dungeon entrances including later overrides", () => {
  const dungeonFile = [
    "local dungeons = {",
    '    [1176] = {"Zul\'Farrak",{978},440,{{440, 38.7, 20.1}}}, -- quests are 978',
    '    [718] = {"Wailing Caverns",nil,17,{{17, 46, 36.5}}},',
    "}",
    "    dungeons[1176][4] = {{440, 39.2, 21.3}} -- Zul'Farrak"
  ].join("\r\n");
  const entrances = questie.parseDungeonEntrances(dungeonFile, zones);
  assert.deepEqual(JSON.parse(JSON.stringify(entrances["Zul'Farrak"])), { zone: "Tanaris", x: 39.2, y: 21.3 });
  assert.deepEqual(JSON.parse(JSON.stringify(entrances["Wailing Caverns"])), { zone: "The Barrens", x: 46, y: 36.5 });
});

test("offers every quest whose prerequisites are done, not just the first open one", () => {
  const toc = buildToc([
    tocLine("Quest-1-S", encodeBase64({ 1: "Opening", 5: 36, 17: 17 })),
    tocLine("Quest-2-S", encodeBase64({ 1: "Branch A", 5: 38, 17: 17 })),
    tocLine("Quest-2-12", encodeBase64([1])),
    tocLine("Quest-3-S", encodeBase64({ 1: "Branch B", 5: 38, 17: 17 })),
    tocLine("Quest-3-12", encodeBase64([1])),
    tocLine("Quest-4-S", encodeBase64({ 1: "Finale", 5: 40, 17: 17 })),
    tocLine("Quest-4-12", encodeBase64([2, 3]))
  ]);
  const details = questie.buildDetails(toc, [], zones, []);
  const chain = questie.questChain(details, 4);
  const names = function stepNames(steps) {
    return Array.from(steps).map(function stepName(step) {
      return step.name;
    });
  };
  assert.deepEqual(names(questie.availableSteps(chain, new Set())), ["Opening"]);
  assert.deepEqual(names(questie.availableSteps(chain, new Set([1]))), ["Branch A", "Branch B"]);
  assert.deepEqual(names(questie.availableSteps(chain, new Set([1, 2]))), ["Branch B"]);
  assert.deepEqual(names(questie.availableSteps(chain, new Set([1, 2, 3]))), ["Finale"]);
  assert.deepEqual(names(questie.availableSteps(chain, new Set([1, 2, 3, 4]))), []);
});

test("treats an either-or prerequisite as met when one of them is done", () => {
  const toc = buildToc([
    tocLine("Quest-1-S", encodeBase64({ 1: "Horde Start", 5: 30, 17: 17 })),
    tocLine("Quest-2-S", encodeBase64({ 1: "Alliance Start", 5: 30, 17: 17 })),
    tocLine("Quest-3-S", encodeBase64({ 1: "Shared Next", 5: 31, 17: 17 })),
    tocLine("Quest-3-13", encodeBase64([1, 2]))
  ]);
  const details = questie.buildDetails(toc, [], zones, []);
  const chain = questie.questChain(details, 3);
  assert.equal(questie.availableSteps(chain, new Set([1]))[0].name, "Shared Next");
});

test("reads spawns of creatures in zone 1, which are packed as a plain list", () => {
  const toc = buildToc([
    tocLine("Item-200-S", encodeBase64({ 1: "Dwarven Boots" })),
    tocLine("Item-200-14", encodeBase64([1238])),
    tocLine("Npc-1238-S", encodeBase64({ 1: "Gamili Frosthide", 9: 1, 13: "A" })),
    tocLine("Npc-1238-7", encodeBase64([[[45, 51]]]))
  ]);
  const source = questie.buildDetails(toc, [200], { 1: "Dun Morogh" }, []).items[200].sources[0];
  assert.equal(source.zone, "Dun Morogh");
  assert.equal(source.x, 45);
  assert.equal(source.y, 51);
});

test("reads an entity whose fields are packed as a plain list", () => {
  const toc = buildToc([
    tocLine("Item-300-S", encodeBase64({ 1: "Zum'rah's Vexing Cane" })),
    tocLine("Item-300-2", encodeBase64([220076])),
    tocLine("Npc-220076-S", encodeBase64(["Witch Doctor Zum'rah", 0, 0, 46, 46, 1, 0, 0, 1176]))
  ]);
  const drop = questie.buildDetails(toc, [300], zones, []).items[300].sources[0];
  assert.equal(drop.npc, "Witch Doctor Zum'rah");
  assert.equal(drop.minLevel, 46);
  assert.equal(drop.rank, 1);
  assert.equal(drop.zone, "Zul'Farrak");
});
