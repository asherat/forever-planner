const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const jpeg = require("jpeg-js");

const ROOT = path.join(__dirname, "..");
const CACHE_DIRECTORY = path.join(ROOT, "data", "cache", "map-tiles");
const TABLE_DIRECTORY = path.join(ROOT, "data", "cache", "wago");
const OUTPUT_DIRECTORY = path.join(ROOT, "web", "maps");
const WAGO_HOST = "https://wago.tools";
const WAGO_PRODUCT = "wowf";
const USER_AGENT = "forever-planner-data-builder";
const JPEG_QUALITY = 72;
const OUTPUT_WIDTH = 560;
const BLP_COMPRESSION_DXT = 2;
const DXT1_ALPHA_TYPE = 0;
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

async function tileFile(fileDataId) {
  const cacheFile = path.join(CACHE_DIRECTORY, fileDataId + ".blp");
  if (!fs.existsSync(cacheFile)) {
    fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });
    fs.writeFileSync(cacheFile, await download(WAGO_HOST + "/api/casc/" + fileDataId));
  }
  return fs.readFileSync(cacheFile);
}

function expandColor(value) {
  return [((value >> 11) & 31) * 255 / 31, ((value >> 5) & 63) * 255 / 63, (value & 31) * 255 / 31];
}

function decodeDxt1(data, width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  let offset = 0;
  for (let blockY = 0; blockY < height; blockY += 4) {
    for (let blockX = 0; blockX < width; blockX += 4) {
      const first = data.readUInt16LE(offset);
      const second = data.readUInt16LE(offset + 2);
      const bits = data.readUInt32LE(offset + 4);
      offset += 8;
      const colorA = expandColor(first);
      const colorB = expandColor(second);
      const palette = [colorA, colorB];
      if (first > second) {
        palette.push([(2 * colorA[0] + colorB[0]) / 3, (2 * colorA[1] + colorB[1]) / 3, (2 * colorA[2] + colorB[2]) / 3]);
        palette.push([(colorA[0] + 2 * colorB[0]) / 3, (colorA[1] + 2 * colorB[1]) / 3, (colorA[2] + 2 * colorB[2]) / 3]);
      } else {
        palette.push([(colorA[0] + colorB[0]) / 2, (colorA[1] + colorB[1]) / 2, (colorA[2] + colorB[2]) / 2]);
        palette.push([0, 0, 0]);
      }
      for (let pixel = 0; pixel < 16; pixel += 1) {
        const x = blockX + (pixel % 4);
        const y = blockY + Math.floor(pixel / 4);
        if (x >= width || y >= height) {
          continue;
        }
        const color = palette[(bits >>> (pixel * 2)) & 3];
        const target = (y * width + x) * 4;
        pixels[target] = color[0];
        pixels[target + 1] = color[1];
        pixels[target + 2] = color[2];
        pixels[target + 3] = 255;
      }
    }
  }
  return pixels;
}

function decodeBlp(file) {
  if (file.toString("ascii", 0, 4) !== "BLP2") {
    throw new Error("Not a BLP2 file");
  }
  const compression = file[8];
  const alphaType = file[10];
  const width = file.readUInt32LE(12);
  const height = file.readUInt32LE(16);
  if (compression !== BLP_COMPRESSION_DXT || alphaType !== DXT1_ALPHA_TYPE) {
    throw new Error("Unsupported BLP encoding " + compression + "/" + alphaType);
  }
  const mipOffset = file.readUInt32LE(20);
  return { width: width, height: height, pixels: decodeDxt1(file.subarray(mipOffset), width, height) };
}

function loadMapData() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "web", "data", "maps.js"), "utf8"), context);
  return context.window.FOREVER_MAPS;
}

function downscale(pixels, width, height, outputWidth) {
  const outputHeight = Math.round(height * outputWidth / width);
  const output = Buffer.alloc(outputWidth * outputHeight * 4);
  for (let outputY = 0; outputY < outputHeight; outputY += 1) {
    const startY = Math.floor(outputY * height / outputHeight);
    const endY = Math.max(startY + 1, Math.floor((outputY + 1) * height / outputHeight));
    for (let outputX = 0; outputX < outputWidth; outputX += 1) {
      const startX = Math.floor(outputX * width / outputWidth);
      const endX = Math.max(startX + 1, Math.floor((outputX + 1) * width / outputWidth));
      const sums = [0, 0, 0, 0];
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          for (let channel = 0; channel < 4; channel += 1) {
            sums[channel] += pixels[(y * width + x) * 4 + channel];
          }
        }
      }
      const count = (endY - startY) * (endX - startX);
      for (let channel = 0; channel < 4; channel += 1) {
        output[(outputY * outputWidth + outputX) * 4 + channel] = Math.round(sums[channel] / count);
      }
    }
  }
  return { data: output, width: outputWidth, height: outputHeight };
}

async function buildMap(uiMapId, tables) {
  const art = tables.mapArt.find(function isPhaseZero(row) {
    return row.UiMapID === String(uiMapId) && row.PhaseID === "0";
  });
  if (!art) {
    return false;
  }
  const style = tables.art.find(function isArt(row) {
    return row.ID === art.UiMapArtID;
  });
  const layer = tables.layers.find(function isBaseLayer(row) {
    return row.UiMapArtStyleID === style.UiMapArtStyleID && row.LayerIndex === "0";
  });
  const tiles = tables.tiles.filter(function isArtTile(row) {
    return row.UiMapArtID === art.UiMapArtID && row.LayerIndex === "0";
  });
  const width = Number(layer.LayerWidth);
  const height = Number(layer.LayerHeight);
  const tileWidth = Number(layer.TileWidth);
  const tileHeight = Number(layer.TileHeight);
  const canvas = Buffer.alloc(width * height * 4);
  for (const tile of tiles) {
    const image = decodeBlp(await tileFile(tile.FileDataID));
    const originX = Number(tile.ColIndex) * tileWidth;
    const originY = Number(tile.RowIndex) * tileHeight;
    for (let y = 0; y < image.height && originY + y < height; y += 1) {
      for (let x = 0; x < image.width && originX + x < width; x += 1) {
        image.pixels.copy(canvas, ((originY + y) * width + originX + x) * 4, (y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
      }
    }
  }
  const encoded = jpeg.encode(downscale(canvas, width, height, OUTPUT_WIDTH), JPEG_QUALITY);
  fs.writeFileSync(path.join(OUTPUT_DIRECTORY, uiMapId + ".jpg"), encoded.data);
  return true;
}

async function main() {
  const build = await latestBuild();
  const tables = {
    mapArt: await wagoTable("UiMapXMapArt", build),
    art: await wagoTable("UiMapArt", build),
    layers: await wagoTable("UiMapArtStyleLayer", build),
    tiles: await wagoTable("UiMapArtTile", build)
  };
  const maps = loadMapData();
  const uiMapIds = [];
  for (const name of Object.keys(maps.continents)) {
    uiMapIds.push(maps.continents[name].uiMapId);
  }
  for (const name of Object.keys(maps.zones)) {
    uiMapIds.push(maps.zones[name].uiMapId);
  }
  fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  let built = 0;
  for (const uiMapId of uiMapIds) {
    if (await buildMap(uiMapId, tables)) {
      built += 1;
    } else {
      console.error("No map art for UiMap " + uiMapId);
    }
  }
  console.error("Built " + built + " of " + uiMapIds.length + " maps from WoW: Forever build " + build);
}

main();
