const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts, evaluate } = require("./helpers/load");

function freshRoute() {
  const context = loadScripts(["zone-guide.js", "route.js"]);
  const character = { slug: "test-character" };
  const snapshot = { level: 42, factionType: "HORDE" };
  return { context, character, snapshot };
}

function zoneNames(zones) {
  const names = [];
  for (const zone of zones) {
    names.push(zone.name);
  }
  return names;
}

test("suggests zones for the level and faction, best tier first", () => {
  const { context } = freshRoute();
  const suggestions = context.nextZoneSuggestions(42, "HORDE", null);
  const ready = zoneNames(suggestions.ready);
  assert.ok(ready.includes("Riverglades"));
  assert.ok(ready.includes("Tanaris"));
  assert.ok(!ready.includes("Duskwood"), "Alliance-only zones are left out for Horde");
  assert.equal(suggestions.ready[0].tier, "S");
  assert.ok(zoneNames(suggestions.later).includes("Searing Gorge"));
});

test("a chosen zone runs from the current level to the end of its range", () => {
  const { context, character, snapshot } = freshRoute();
  context.chooseZone(character, snapshot, "Riverglades");
  const legs = context.routeLegs(character, snapshot);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].fromLevel, 42);
  assert.equal(legs[0].toLevel, 45);
});

test("a zone that starts too late asks how to close the gap", () => {
  const { context, character, snapshot } = freshRoute();
  context.chooseZone(character, snapshot, "Riverglades");
  context.chooseZone(character, snapshot, "Burning Steppes");
  const gap = evaluate(context, "routeEditor.pendingGap");
  assert.equal(gap.zone, "Burning Steppes");
  assert.equal(gap.fromLevel, 45);
  assert.equal(gap.startLevel, 50);
});

test("closing a gap by staying longer extends the previous zone", () => {
  const { context, character, snapshot } = freshRoute();
  context.chooseZone(character, snapshot, "Riverglades");
  context.chooseZone(character, snapshot, "Burning Steppes");
  context.resolveGap(character, snapshot, "stay", null);
  const legs = context.routeLegs(character, snapshot);
  assert.equal(legs[0].toLevel, 50);
  assert.equal(legs[1].zone, "Burning Steppes");
  assert.equal(legs[1].fromLevel, 50);
});

test("closing a gap with a filler zone inserts it before the chosen zone", () => {
  const { context, character, snapshot } = freshRoute();
  context.chooseZone(character, snapshot, "Riverglades");
  context.chooseZone(character, snapshot, "Burning Steppes");
  context.resolveGap(character, snapshot, "fill", "Tanaris");
  const legs = context.routeLegs(character, snapshot);
  assert.deepEqual([legs[0].zone, legs[1].zone, legs[2].zone], ["Riverglades", "Tanaris", "Burning Steppes"]);
  assert.equal(legs[1].toLevel, 50);
});

test("dungeons only count for a zone when they are included", () => {
  const { context, character, snapshot } = freshRoute();
  context.chooseZone(character, snapshot, "Tanaris");
  assert.equal(context.legForZone(character, snapshot, "Zul'Farrak"), null);
  character.route.legs[0].dungeons = true;
  assert.equal(context.legForZone(character, snapshot, "Zul'Farrak").zone, "Tanaris");
});
