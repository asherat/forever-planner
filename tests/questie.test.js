const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");
const { encodeBase64 } = require("./helpers/cbor");

const questie = loadScripts(["questie.js"]).QUESTIE;
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
