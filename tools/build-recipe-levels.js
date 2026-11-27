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
const LEARNED_WITH_PROFESSION = "1";
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

function professionAbilities(abilities) {
  const skillLines = Object.values(PROFESSIONS).map(String);
  return abilities.filter(function isRankedRecipe(ability) {
    return skillLines.indexOf(ability.SkillLine) !== -1 && Number(ability.TrivialSkillLineRankHigh) > 0;
  });
}

function learnLevel(row, yellow) {
  if (row === undefined || !hasColors(row)) {
    return yellow;
  }
  if (row.colors[0] > 0) {
    return Math.min(row.colors[0], yellow);
  }
  return Math.min(row.learnedAt || yellow, yellow);
}

function recipeLevels(ability, row) {
  const yellow = Number(ability.TrivialSkillLineRankLow);
  const grey = Number(ability.TrivialSkillLineRankHigh);
  let learnedAt = learnLevel(row, yellow);
  if (ability.AcquireMethod === LEARNED_WITH_PROFESSION) {
    learnedAt = 1;
  }
  return [learnedAt, yellow, Math.floor((yellow + grey) / 2), grey];
}

function hasColors(row) {
  return Array.isArray(row.colors) && row.colors.length === 4;
}

async function main() {
  const build = await latestBuild();
  const abilities = professionAbilities(await wagoTable("SkillLineAbility", build));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const wowheadRows = new Map();
  try {
    for (const name of Object.keys(PROFESSIONS)) {
      const rows = await professionRecipes(browser, name, PROFESSIONS[name]);
      for (const row of rows) {
        wowheadRows.set(row.id, row);
      }
      console.error(name + ": " + rows.length + " recipes on Wowhead");
    }
  } finally {
    await browser.close();
  }
  const levels = {};
  let compared = 0;
  let mismatched = 0;
  let withoutLearnLevel = 0;
  for (const ability of abilities) {
    const row = wowheadRows.get(Number(ability.Spell));
    levels[ability.ID] = recipeLevels(ability, row);
    if (row === undefined || !hasColors(row)) {
      withoutLearnLevel += 1;
      continue;
    }
    compared += 1;
    if (Number(ability.TrivialSkillLineRankLow) !== row.colors[1] || Number(ability.TrivialSkillLineRankHigh) !== row.colors[3]) {
      mismatched += 1;
    }
  }
  console.error("Checked against the game files: " + mismatched + " of " + compared + " recipes differ in yellow or grey");
  console.error(withoutLearnLevel + " recipes have no learn level on Wowhead; they start at yellow");
  if (compared === 0 || mismatched / compared > MAXIMUM_MISMATCH_SHARE) {
    throw new Error("Too many recipes disagree with the game files; not writing " + OUTPUT_FILE);
  }
  fs.writeFileSync(OUTPUT_FILE, "window.FOREVER_RECIPE_LEVELS = " + JSON.stringify(levels) + ";\n");
  console.error("Wrote " + Object.keys(levels).length + " recipes to " + path.relative(ROOT, OUTPUT_FILE));
}

main();
