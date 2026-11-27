# Forever Planner: project guide

Read this before changing anything. It explains what the planner is for, how it is built, and which decisions are settled. User-facing features are in `README.md`; release history is in `CHANGELOG.md`.

## Intention

A gear, leveling and crafting planner for **WoW: Forever** characters. It exists because GearQuest (the in-game addon) is awkward to use, sometimes fails to rank gear for feral druids, and only judges items you have just looted. The planner answers "what should I go get next, and where?" based on your character, your leveling path and your gold.

Its users are an experienced player and a brand-new player, so **simplicity beats configurability**:

- No stat-weight knobs. Weights come from spec presets plus a single Questing / Dungeons choice. Questing halves hit and expertise (same-level mobs need far less hit than the bosses the presets are tuned for). Questing on a PvP-ruleset character, read from the profile, also gives Stamina at least 60% of the spec's main-stat weight; dungeons use the presets as they are.
- Specs are detected from talents. Main/off spec is one selector, plus cat/bear for feral druids.
- Every UI choice should be something a new player understands without reading docs.
- Suggestions must be things you can actually get: right faction and class, a known source, reputation within reach, quests not yet completed, a zone on your path.

## Architecture

A static site built with Vite from `web/` and served by GitHub Pages. There is no server.

- **Migration to TypeScript + Vue 3 is in progress** (chosen 2026-11-27). Plan: (1) Vite pipeline with the old code unchanged — done; (2) logic files become typed modules in `web/src/`, tests with them — done: `tsm.ts`, `lua.ts`, `scoring.ts`, `sources.ts`, `upgrades.ts`, `route.ts` (its panel stays in `route-panel.js` until step 4);  (3) the Questie reader becomes a typed module, still reading the player's installed QuestieDB — done; (4) the UI moves into Vue components one piece at a time, then the crafting page. Each step is its own release.
- **How a Vue piece joins the classic page (step 4):** give the piece an empty mount point in the HTML, mount its component in `main.ts` *after* `window.start()` (the classic code loads settings there; mounting earlier renders with no settings), move its logic into `web/src/ui/` and delete the classic render function and its event wiring. The classic `render()` calls `refreshVue()`, which bumps `renderTick`; components read `renderTick.value` inside their computeds so they redraw whenever the classic page does. When the last classic renderer is gone, replace the tick with a reactive store. Check every piece in a real browser, both themes, with no console errors.
- Until a file is migrated it stays a plain classic `<script>` in `web/public/` that shares globals; Vite copies `web/public/` as-is (its "can't be bundled" warnings for those tags are expected). Load order is in `index.html` and `crafting.html`. New code goes in `web/src/` (TypeScript, Vue SFCs), entry `web/src/main.ts`.
- **The browser calls the Battle.net API directly** with the user's own API client. The secret lives only in `localStorage`. Battle.net rejects `Origin: null`, so the site must be served over HTTP, never opened as `file://`.
- **Local WoW files** are read through the File System Access API, from a picked `World of Warcraft` or `_forever_` folder whose handle is kept in IndexedDB. The files are read, never uploaded.
  - Questie (`QuestieDB_Forever.toc`, base64 CBOR records, plus `support/Forever/Zones/dungeons.lua`) supplies item sources, quest data and dungeon entrances.
  - TradeSkillMaster supplies prices (`TradeSkillMaster_AppHelper/AppData.lua`, base-32 copper) and inventory (`WTF/Account/*/SavedVariables/TradeSkillMaster.lua`).
- **The wowsims/forever item database** (`assets/database/db.json`, MIT) fills in the items Forever hides from Battle.net and the game files until players discover them (new Forever items, and many relocated Classic ones). `data/build.py` adds every phase 1 item it has that Battle.net doesn't, marked `fromSimulator`, with quest and reputation sources; drops and vendors for them come from Questie at runtime like for any other item. Their icons come from Wowhead's icon CDN by name.
- **Wowhead** is used for two things only:
  - the nether tooltip API, to fill in reputation requirements that Battle.net omits (cached 14 days, failures retried after 1 day);
  - outbound links to `https://www.wowhead.com/forever/{item|quest|npc}=ID`.

| File | Role |
|---|---|
| `web/index.html`, `web/public/app.js` | Gear page rendering and events: paper doll, upgrade cards, crafting list, quest list, settings dialog |
| `web/src/scoring.ts` | Specs and weights, item scores, random-suffix variants, proficiencies, slot baselines (typed, no DOM) |
| `web/src/types.ts` | Shared types: items, sources, snapshot, character, slots, game rules |
| `web/src/sources.ts` | Where an item comes from: sources, quest/reputation rules, trash/container/skipped-dungeon rules, prices, gold limit (typed, no DOM; `resetSourceCaches` for tests) |
| `web/src/upgrades.ts` | Ranking candidates per slot, route availability, quicker option, ring/trinket and weapon pairing (typed, no DOM). `observeRanking` lets `app.js` queue Wowhead tooltip checks for the top candidates without ranking knowing about it |
| `web/src/` | New TypeScript and Vue code (see the migration plan above); `web/src/main.ts` is the module entry |
| `vite.config.ts`, `tsconfig.json` | Build (`npm run build` → `dist/`) and type check (`npm run typecheck`) |
| `web/crafting.html`, `web/public/crafting.js` | Crafting tool: recipe trees with own / vendor / AH / craft per material, totals, shopping list, recipe sources |
| `web/public/common.js` | Shared state, storage keys, Battle.net fetch, WoW folder reading, prices and money, Wowhead links, map popovers |
| `web/src/route.ts` | Leveling path logic: zone suggestions, legs, gaps and empty levels, dungeons by area, route legs used by gear availability (typed, no DOM) |
| `web/public/route-panel.js` | The leveling path panel (rendering and clicks); moves into Vue in step 4 |
| `web/public/zone-guide.js` | Hand-maintained zone tiers, notes, level ranges, factions and dungeons |
| `web/public/game-rules.js` | Slots, class proficiencies, spec presets and playstyles |
| `web/src/questie.ts` | CBOR decoder and Questie lookups from the installed `QuestieDB_Forever.toc` (sources, quest info, chains, starters, dungeon entrances). Questie packs a record whose keys are exactly 1..n as a plain list; `asKeyedTable` reads it as fields 1..n (the old reader got those names, levels and zones wrong) |
| `web/src/tsm.ts`, `web/public/wow-folder.js` | TSM price and inventory parsers (typed module), folder handle and file access |
| `web/src/lua.ts` | Reader for Lua table text (TSM saved variables; Questie data next) |
| `web/src/components/*.vue`, `web/src/ui/*.ts` | Vue components and the UI state behind them (step 4). Done: Undo line, "Not interested" list, `ItemIcon`, `WowheadLink` |
| `web/src/main.ts`, `web/src/crafting.ts`, `web/src/legacy.ts` | Page entries. They hand typed modules to the classic scripts (`window.TSM` …) and then call the classic `start()` / `startCrafting()`; module scripts run after the classic ones, so starting there guarantees everything exists. `legacy.ts` types the window globals and the classic globals typed modules still use (`state`, `itemById`, …), and `exposeToLegacy` puts a module's exports on `window` for the classic scripts; shrink it as files migrate |
| `web/public/data/*.js` | Generated game data. Don't edit by hand |
| `web/public/maps/*.jpg` | Generated hover maps, one per `uiMapId` |
| `data/build.py` | Crawls the Battle.net Forever API, wago.tools and the wowsims item database and writes `web/public/data/*.js` |
| `tools/build-maps.js` | Stitches the game's map tiles (wago.tools CASC, BLP2 DXT1) into 560 px JPEGs |

### Data rebuilds

1. `python3 -I data/build.py` needs `~/.config/blizzard-api.env` with `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET`.
2. Then `node tools/build-maps.js`, which needs `npm install` for `jpeg-js`.

Both cache their downloads in `data/cache/`, which is not committed. wago tables are cached per game build (`data/cache/wago/<build>/`, one build per run), the wowsims database per commit (`SIMULATOR_COMMIT` in `build.py`; bump it to pick up newly discovered items), and Battle.net "not found" answers are retried after 7 days because Forever reveals items over time. Outputs are written only after everything has been built.

wago.tools returns 403 without a User-Agent and 429 when hit too fast. The builders send a User-Agent and throttle with retries.

Battle.net Forever namespaces are `static-forever-{region}`, `profile-forever-{region}` and `dynamic-forever-{region}`. Characters are looked up as `{name}-{surname}`.

## Settled decisions (don't reopen without a reason)

- **Hosted on GitHub Pages.** Not an extension, an exe, a `.bat`, a server or a Claude artifact. The players use Chrome on Windows and must not need any tooling.
- **No QuestieDB data in the repo.** Its licence is unclear, so it is always read from the user's own install. Fetching it from GitHub instead was checked on 2026-11-27 and rejected: the packaged release (`QuestieDB-<version>-Forever.zip`, with the baked `QuestieDB_Forever.toc`) can't be downloaded by a browser (GitHub's release file server sends no CORS header), and the raw source files in the repo lack the new Forever content and Questie's corrections (no Eye of Mugg; about a third of quests with different levels or quest givers). Publishing the release with our site would redistribute it.
- **Zone level ranges come from Icy Veins' guide, not from Questie quest levels.** Ranges derived from Questie were tried and rejected because they disagree with how people actually level. The one exception, Mount Hyjal, is kept at 55–60.
- **Reputation items are suggested only within one standing of the current one.** Grinding reputation is slower than levelling to the next item.
- **Only the selected spec counts.** The main/off selector switches the whole gear page to that spec; the other spec's gains are never shown.
- **Quest chains are prerequisite trees, not lines.** The quest list shows every quest whose prerequisites are done (`QUESTIE.availableSteps`), never a single "step N of M". Battle.net can't see the quest log, so completed quests are the only progress signal.
- **Refresh prunes the lists:** quest entries whose reward quest is completed or whose item is equipped, and crafting list items that are equipped.
- **Every slot pairs a best upgrade with a quicker option you can reach now.** Rings and trinkets are paired so both picks never come from the same quest.
- **Stat weights come from the Forever simulator, wowsims/forever** (`ui/specs/*/presets.ts` and `ui/specs/druid/feral_ep.ts`, taken at commit 510f0a8). Each preset is the sim's weights scaled so one unit is 1 attack power, spell power, healing or stamina, and that unit is shown on the gain badge. Weapon DPS is weighed per slot: main hand, off hand and ranged. Never use Classic assumptions; in Forever, for example, feral form attacks use weapon DPS.
  - Taken directly: cat and bear, Arms, Fury, Prot warrior, the three rogue specs, Ret ("Unsealed Wrath"), Enhancement, Elemental, Shadow, Holy and Disc priest ("single target"), Balance, hunters (BM and MM use "Turret", Survival uses "Melee").
  - Borrowed, because the sim has no weights for them: Holy paladin, Resto druid and Resto shaman use the Holy priest weights; Prot paladin uses Prot warrior's; mages and warlocks use Balance's caster weights with their own school damage, plus Elemental's Spell Piercing weight for warlocks (Method's Forever guides rank it high for them). Replace these when the sim adds those specs.
- **Random-suffix items are scored as their best suffix for the selected spec.** The card names that suffix and links to it on Wowhead. Suffix stats come from the game files (`ItemXBonusTree` → `ItemBonus`, scaled by `RandPropPoints`); the roll chances are not in them, so none are shown.
- **Each character has a "Max gold per upgrade".** An upgrade whose cheapest way to get it (AH price, vendor price or crafting materials; quests and farmable drops are free) costs more is hidden from both cards, and an AH listing above it doesn't count as an easy source. AH prices also show the gold per point of gain ("≈ 26s per attack power"); gain per gold is shown, never used to rank, because ranking by it favours free and tiny upgrades.
- **The auction house is not a source for random-suffix items.** TSM keeps one price per item for every suffix together (checked against a real `AppData.lua`: only plain item IDs, the `::i1` variants are item levels), so it can't say whether the suffix we suggest is listed or what it costs. Their cards show "AH … for any suffix" for information only; crafting, quests and drops still count.
- **Drops from more than 3 different creatures are not a way to get an item.** Questie has no drop chances, so many creatures (trash, world drops) stands in for a low chance that you shouldn't farm. Containers (chests and the like) don't count either; their loot chances are as low. Such items count only when they're on the AH. Boss, rare and named-mob drops still count as free. The crafting tool keeps listing them as material sources.
- **The dungeon list comes from the game's dungeon finder table (`LFGDungeons`, type 0), not from a website.** It has exactly Forever's dungeons plus the four classic raids; wings are merged into one entry per instance, and each entry's minimum level comes from its `ContentTuning`. `build.py` keeps only the game-data quirks by hand: name fixes ("Zul'Farak", "Stormwind Stockades") and extra area names Battle.net and Questie use. Each dungeon's quests are the Battle.net quest area of the same name. Don't reintroduce a hand-maintained dungeon list.
- **Every dungeon counts automatically**, on the leveling path or not: its boss/rare drops and its quests count from its game level. That level is the game's own minimum, not the highest quest level: one late quest (Sunken Temple, BRD and Dire Maul each have a level 60 one) would push the whole dungeon to 60; each quest still counts from its own level. The player opts out instead of in: "Skip <dungeon>" on an upgrade card adds it to `character.skippedDungeons`, which removes its drops and quests (`obtainableSources`). There is no dungeon list or per-zone dungeon checkbox; adding dungeons one by one was too much work and made the panel too long.
- **Hiding is undoable and self-cleaning.** "Not interested" and "Skip" show an Undo line right away. On Refresh, hidden items that aren't an upgrade for any of the character's specs, and skipped dungeons without upgrades left, are dropped from the list (`pruneNotInterested`).
- **Upgrade cards show only sources, the region-average AH price and the crafted price.** Recipe knowledge belongs in the crafting tool.
- **The crafting tool does not persist its items.** The crafting list on the gear page feeds it through "Craft all".
- **Vendor materials beat the AH unless the AH is more than 15% cheaper.** The Bartering perk takes 5% off per rank.
- **Hover maps are the game's own map art, kept light** (about 50 KB per map, loaded only on hover). Drawn or SVG maps were rejected because they must look the same as in game.
- **Wowhead links go on names whose single source is clear:** quests, vendors and drop mobs. Materials like Light Leather have too many sources to link.

## Code conventions

- Plain named `function` declarations. No arrow functions, no ternaries, no anonymous callbacks; give callbacks names (`function isPhaseZero(row)`). No code comments.
- Build DOM with `createElement` and `textContent`, never `innerHTML` with data.
- English identifiers, descriptive names, no abbreviations.
- Guard only against real data gaps, such as Questie or TSM not being connected.
- Every classic `<script>` and stylesheet URL carries `?build=__BUILD__`; Vite hashes the files it bundles. The deploy workflow builds with Vite, then stamps `__BUILD__` and `__VERSION__` (the latest tag) into `dist/*.html`.
- In TypeScript and Vue: the same naming and no-comments rules; named functions, no ternaries, logic in computed properties or functions rather than in templates, no watchers. Arrow functions only where Vue's API needs them.
- Dependencies are pinned exactly and must be at least two weeks old when added. TypeScript stays on 6.x while vue-tsc needs its JavaScript API.
- WoW files use CRLF line endings. Test every reader against a CRLF fixture.

## Tests and verification

- `npm test` runs `node:test` on `tests/*.test.js` (classic scripts) and `tests/*.test.mjs` (TypeScript modules imported directly; Node strips the types, so modules may only use erasable TypeScript syntax and must import with `.ts` extensions). Classic scripts are loaded into a vm sandbox via `tests/helpers/load.js`, and `tests/helpers/cbor.js` builds Questie fixtures. `tests/planner.test.mjs` uses `tests/helpers/realm.mjs`, which loads the classic gear-page scripts once into the real global scope and imports the typed modules next to them (a module can't be reloaded per test, so `resetPlanner` resets state, caches and `FOREVER_ITEMS` instead) and tests scoring, sources and ranking directly; script-level `const`s such as `state` are read with `run("state")`.
- After converting a file, compare the built site with the built `develop` on the same inputs (every slot's picks in questing, dungeons and with a gold limit); a pure conversion must give 0 differences.
- `python3 -m unittest discover -s tests -p "test_*.py"` tests the data builder.
- Both run in CI before every deploy.
- For UI changes, run `npm run dev` (or `npm run build` and serve `dist/`) and check in a real browser. Playwright with a Battle.net client and a local Questie copy works well. Keep those scripts out of the repo.

## Branches and releases

- git-flow: `feature/*` merges into `develop` (`--no-ff`, "merges feature/x into develop").
- A release merges a `release/X.Y.Z` branch into `main` ("merges release/X.Y.Z into main") and is tagged `vX.Y.Z`.
- Pushing `main` publishes the site.
- Commit subjects are lowercase, third-person verb ("adds …", "fixes …"), with no body.
- Add a `CHANGELOG.md` entry for every release.
