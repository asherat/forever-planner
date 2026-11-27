const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const TABLE_DIRECTORY = path.join(ROOT, "data", "cache", "wago");
const WAGO_HOST = "https://wago.tools";
const WAGO_PRODUCT = "wowf";
const USER_AGENT = "forever-planner-data-builder";
const REQUEST_PAUSE_MILLISECONDS = 300;
const RATE_LIMIT_PAUSE_MILLISECONDS = 5000;
const MAX_ATTEMPTS = 6;

function wait(milliseconds) {
  return new Promise(function resolveLater(resolve) {
    setTimeout(resolve, milliseconds);
  });
}

async function download(url) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await wait(REQUEST_PAUSE_MILLISECONDS);
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.status === 429) {
      await wait(RATE_LIMIT_PAUSE_MILLISECONDS * (attempt + 1));
      continue;
    }
    if (!response.ok) {
      throw new Error("Download failed with " + response.status + ": " + url);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error("Still rate limited after " + MAX_ATTEMPTS + " attempts: " + url);
}

async function latestBuild() {
  const builds = JSON.parse((await download(WAGO_HOST + "/api/builds")).toString("utf8"));
  return builds[WAGO_PRODUCT][0].version;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const rows = [];
  for (const line of lines.slice(1)) {
    const values = line.split(",");
    const row = {};
    for (let index = 0; index < header.length; index += 1) {
      row[header[index]] = values[index];
    }
    rows.push(row);
  }
  return rows;
}

async function wagoTable(tableName, build) {
  const cacheFile = path.join(TABLE_DIRECTORY, build, tableName + ".csv");
  if (!fs.existsSync(cacheFile)) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, await download(WAGO_HOST + "/db2/" + tableName + "/csv?build=" + build));
  }
  return parseCsv(fs.readFileSync(cacheFile, "utf8"));
}

module.exports = { ROOT: ROOT, WAGO_HOST: WAGO_HOST, wait: wait, download: download, latestBuild: latestBuild, wagoTable: wagoTable };
