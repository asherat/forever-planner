import test from "node:test";
import assert from "node:assert/strict";
import { TSM as tsm, tsmItemId } from "../web/src/tsm.ts";

function toBase32(value) {
  return value.toString(32).toUpperCase();
}

const appData = [
  'select(2, ...).LoadData("AUCTIONDB_REGION_STAT","Forever-EU",[[return {downloadTime=1795652983,fields={"itemString","regionMarketValue"},data={{4304,' + toBase32(4500) + '},{4291,' + toBase32(300) + '}}}]]) --<x>',
  'select(2, ...).LoadData("AUCTIONDB_NON_COMMODITY_DATA","PvP-Horde",[[return {downloadTime=1795695716,fields={"itemString","minBuyout","numAuctions","marketValueRecent"},data={{4304,' + toBase32(4000) + ',' + toBase32(40) + ',' + toBase32(4200) + '}}}]]) --<x>',
  'select(2, ...).LoadData("AUCTIONDB_NON_COMMODITY_DATA","PvP-Alliance",[[return {downloadTime=1795695716,fields={"itemString","minBuyout","numAuctions","marketValueRecent"},data={{4304,' + toBase32(99999) + ',1,1}}}]]) --<x>',
  'select(2, ...).LoadData("APP_INFO","Global",[[return {version="1.0.15"}]]) --<x>'
].join("\r\n");

test("reads base-32 prices for the character's ruleset and faction plus region data", () => {
  const result = tsm.readPrices(appData, "PvP", "Horde");
  assert.equal(result.scope, "PvP-Horde");
  assert.equal(result.prices[4304].minBuyout, 4000);
  assert.equal(result.prices[4304].numAuctions, 40);
  assert.equal(result.prices[4304].regionMarketValue, 4500);
  assert.equal(result.prices[4291].regionMarketValue, 300);
});

test("ignores another faction's auction house", () => {
  const result = tsm.readPrices(appData, "PvP", "Horde");
  assert.notEqual(result.prices[4304].minBuyout, 99999);
});

test("falls back to region prices when the ruleset has no local data", () => {
  const result = tsm.readPrices(appData, "Normal", "Orcs");
  assert.equal(result.scope, null);
  assert.equal(result.prices[4304].regionMarketValue, 4500);
});

test("rejects a file without TSM price data", () => {
  assert.throws(() => tsm.readPrices("hello\r\nworld", "PvP", "Horde"));
});

const savedVariables = [
  "TradeSkillMasterDB = {",
  '\t["g@ @coreOptions@minimapIcon"] = {',
  '\t\t["hide"] = false,',
  "\t},",
  '\t["s@Asherat Vaelthorn - Horde - PvP@internalData@bagQuantity"] = {',
  '\t\t["i:4234"] = 28,',
  '\t\t["i:8169::"] = 3,',
  "\t},",
  '\t["s@Asherat Vaelthorn - Horde - PvP@internalData@bankQuantity"] = {',
  '\t\t["i:4234"] = 73,',
  "\t},",
  '\t["s@Asherat Vaelthorn - Horde - PvP@internalData@money"] = 203512,',
  '\t["s@Asherat Vaelthorn - Horde - PvP@internalData@playerProfessions"] = {',
  '\t\t["Leatherworking"] = {',
  '\t\t\t["level"] = 165,',
  '\t\t\t["maxLevel"] = 225,',
  "\t\t},",
  "\t},",
  '\t["s@Moozarello Milkforge - Horde - Normal@internalData@bagQuantity"] = {',
  '\t\t["i:4234"] = 50,',
  "\t},",
  "}"
].join("\r\n");

test("parses inventory from a Windows-style SavedVariables file", () => {
  const characters = tsm.parseInventory(savedVariables);
  assert.deepEqual(Object.keys(characters).sort(), ["Asherat Vaelthorn", "Moozarello Milkforge"]);
  const asherat = characters["Asherat Vaelthorn"];
  assert.equal(asherat.bags[4234], 28);
  assert.equal(asherat.bags[8169], 3);
  assert.equal(asherat.bank[4234], 73);
  assert.equal(asherat.money, 203512);
  assert.equal(asherat.ruleset, "PvP");
  assert.equal(asherat.faction, "Horde");
  assert.deepEqual(JSON.parse(JSON.stringify(asherat.professions)), [{ name: "Leatherworking", level: 165, maxLevel: 225 }]);
  assert.equal(characters["Moozarello Milkforge"].ruleset, "Normal");
});

test("parses inventory with Unix line endings too", () => {
  const characters = tsm.parseInventory(savedVariables.replace(/\r\n/g, "\n"));
  assert.equal(characters["Asherat Vaelthorn"].bank[4234], 73);
});

test("skips WoW's index comments and keeps going after a broken section", () => {
  const withComments = [
    "TradeSkillMasterDB = {",
    '["s@Gominolo Azul - Horde - PvP@internalData@bagQuantity"] = {',
    '["i:2589"] = 12, -- [1]',
    "},",
    '["s@Gominolo Azul - Horde - PvP@internalData@bankQuantity"] = {',
    '["i:2589"] = = broken,',
    "},",
    '["s@Gominolo Azul - Horde - PvP@internalData@money"] = 500,',
    "}"
  ].join("\r\n");
  const characters = tsm.parseInventory(withComments);
  assert.equal(characters["Gominolo Azul"].bags[2589], 12);
  assert.equal(characters["Gominolo Azul"].money, 500);
});

test("does not borrow another ruleset's auction house for the same faction", () => {
  const result = tsm.readPrices(appData, "Normal", "Horde");
  assert.equal(result.scope, null);
});

test("skips item-level variants and short rows instead of inventing prices", () => {
  assert.equal(tsmItemId("i:285282::i1"), null);
  assert.equal(tsmItemId("i:4304"), 4304);
  const shortRow = 'select(2, ...).LoadData("AUCTIONDB_REGION_STAT","Forever-EU",[[return {downloadTime=1,fields={"itemString","regionMarketValue","regionSale"},data={{4304,' + (4500).toString(32) + '}}}]]) --<x>';
  const result = tsm.readPrices(shortRow, "PvP", "Horde");
  assert.deepEqual(Object.keys(result.prices[4304]), ["regionMarketValue"]);
});
