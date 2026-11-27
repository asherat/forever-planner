const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");
const { ROOT, latestBuild, wait, wagoTable } = require("./wago.js");

const CACHE_DIRECTORY = path.join(ROOT, "data", "cache", "wowhead");
const OUTPUT_FILE = path.join(ROOT, "web", "public", "data", "recipe-levels.js");
const WOWHEAD_SKILL_URL = "https://www.wowhead.com/forever/skill=";
const PAGE_SETTLE_MILLISECONDS = 6000;
const PAGE_PAUSE_MILLISECONDS = 4000;
const BROWSER_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const CACHE_DAYS = 30;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAXIMUM_MISMATCH_SHARE = 0.05;
const PROFESSIONS = {
  Alchemy: 171,
  Blacksmithing: 164,
  Cooking: 185,
  Enchanting: 333,
  Engineering: 202,
  "First Aid": 129,
  Leatherworking: 165,
  Tailoring: 197
};

function cacheFile(skillId) {
  return path.join(CACHE_DIRECTORY, "skill-" + skillId + ".json");
}

function isFresh(file) {
  return fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < CACHE_DAYS * DAY_IN_MILLISECONDS;
}

function readRecipeRows() {
  const views = Object.values(window.g_listviews || {});
  for (const view of views) {
    if (view.id === "recipes" && view.data) {
      return view.data.map(function rowOf(row) {
        return { id: row.id, name: row.name, colors: row.colors, learnedAt: row.learnedat };
      });
    }
  }
  return null;
}

async function professionRecipes(browser, name, skillId) {
  const file = cacheFile(skillId);
  if (isFresh(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const page = await browser.newPage({ userAgent: BROWSER_USER_AGENT });
  await page.goto(WOWHEAD_SKILL_URL + skillId, { waitUntil: "domcontentloaded", timeout: 60000 });
  await wait(PAGE_SETTLE_MILLISECONDS);
  const rows = await page.evaluate(readRecipeRows);
  await page.close();
  if (rows === null || rows.length === 0) {
    throw new Error("No recipe list on Wowhead's " + name + " page");
  }
  fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows));
  await wait(PAGE_PAUSE_MILLISECONDS);
  return rows;
}

function gameTrivialLevels(abilities) {
  const levels = new Map();
  for (const ability of abilities) {
    levels.set(Number(ability.Spell), { yellow: Number(ability.TrivialSkillLineRankLow), grey: Number(ability.TrivialSkillLineRankHigh) });
  }
  return levels;
}

function learnLevel(row) {
  if (row.colors[0] > 0) {
    return row.colors[0];
  }
  return row.learnedAt || 0;
}

function combinedLevels(row, game) {
  const green = Math.floor((game.yellow + game.grey) / 2);
  return [Math.min(learnLevel(row), game.yellow), game.yellow, green, game.grey];
}

function hasColors(row) {
  return Array.isArray(row.colors) && row.colors.length === 4;
}

async function main() {
  const build = await latestBuild();
  const gameLevels = gameTrivialLevels(await wagoTable("SkillLineAbility", build));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const levels = {};
  let compared = 0;
  let mismatched = 0;
  try {
    for (const name of Object.keys(PROFESSIONS)) {
      const rows = (await professionRecipes(browser, name, PROFESSIONS[name])).filter(hasColors);
      for (const row of rows) {
        const game = gameLevels.get(row.id);
        if (game && game.grey > 0) {
          levels[row.id] = combinedLevels(row, game);
          compared += 1;
          if (game.yellow !== row.colors[1] || game.grey !== row.colors[3]) {
            mismatched += 1;
          }
        }
      }
      console.error(name + ": " + rows.length + " recipes");
    }
  } finally {
    await browser.close();
  }
  console.error("Checked against the game files: " + mismatched + " of " + compared + " recipes differ in yellow or grey");
  if (compared === 0 || mismatched / compared > MAXIMUM_MISMATCH_SHARE) {
    throw new Error("Too many recipes disagree with the game files; not writing " + OUTPUT_FILE);
  }
  fs.writeFileSync(OUTPUT_FILE, "window.FOREVER_RECIPE_LEVELS = " + JSON.stringify(levels) + ";\n");
  console.error("Wrote " + Object.keys(levels).length + " recipes to " + path.relative(ROOT, OUTPUT_FILE));
}

main();
