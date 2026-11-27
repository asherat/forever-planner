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

A static site in `web/`, served by GitHub Pages. There is no server and no build step.

- Plain classic `<script>` files that share globals. There is no framework and no bundler. Load order is in `index.html` and `crafting.html`.
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
| `web/index.html`, `web/app.js` | Gear page: paper doll, upgrade scoring and selection, upgrade cards, crafting list, quest list, settings dialog |
| `web/crafting.html`, `web/crafting.js` | Crafting tool: recipe trees with own / vendor / AH / craft per material, totals, shopping list, recipe sources |
| `web/common.js` | Shared state, storage keys, Battle.net fetch, WoW folder reading, prices and money, Wowhead links, map popovers |
| `web/route.js` | Leveling path editor: zone suggestions, gap filling, route legs used by gear availability |
| `web/zone-guide.js` | Hand-maintained zone tiers, notes, level ranges, factions and dungeons |
| `web/game-rules.js` | Slots, class proficiencies, spec presets and playstyles |
| `web/questie.js` | CBOR decoder and Questie lookups (sources, quest info, chains, starters, dungeon entrances) |
| `web/tsm.js`, `web/wow-folder.js` | TSM price and inventory parsers, folder handle and file access |
| `web/data/*.js` | Generated game data. Don't edit by hand |
| `web/maps/*.jpg` | Generated hover maps, one per `uiMapId` |
| `data/build.py` | Crawls the Battle.net Forever API, wago.tools and the wowsims item database and writes `web/data/*.js` |
| `tools/build-maps.js` | Stitches the game's map tiles (wago.tools CASC, BLP2 DXT1) into 560 px JPEGs |

### Data rebuilds

1. `python3 -I data/build.py` needs `~/.config/blizzard-api.env` with `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET`.
2. Then `node tools/build-maps.js`, which needs `npm install` for `jpeg-js`.

Both cache their downloads in `data/cache/`, which is not committed.

wago.tools returns 403 without a User-Agent and 429 when hit too fast. The builders send a User-Agent and throttle with retries.

Battle.net Forever namespaces are `static-forever-{region}`, `profile-forever-{region}` and `dynamic-forever-{region}`. Characters are looked up as `{name}-{surname}`.

## Settled decisions (don't reopen without a reason)

- **Hosted on GitHub Pages.** Not an extension, an exe, a `.bat`, a server or a Claude artifact. The players use Chrome on Windows and must not need any tooling.
- **No QuestieDB data in the repo.** Its licence is unclear, so it is always read from the user's own install.
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
- **Drops from more than 3 different creatures are not a way to get an item.** Questie has no drop chances, so many creatures (trash, world drops) stands in for a low chance that you shouldn't farm. Such items count only when they're on the AH. Boss and named-mob drops still count as free. The crafting tool keeps listing them as material sources.
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
- Every `<script>` and stylesheet URL carries `?build=__BUILD__`. The deploy workflow stamps `__BUILD__` and `__VERSION__` (the latest tag) into the HTML.
- WoW files use CRLF line endings. Test every reader against a CRLF fixture.

## Tests and verification

- `npm test` runs `node:test`. Scripts are loaded into a vm sandbox via `tests/helpers/load.js`, and `tests/helpers/cbor.js` builds Questie fixtures.
- `python3 -m unittest discover -s tests -p "test_*.py"` tests the data builder.
- Both run in CI before every deploy.
- For UI changes, serve `web/` (`python3 -m http.server`) and check in a real browser. Playwright with a Battle.net client and a local Questie copy works well. Keep those scripts out of the repo.

## Branches and releases

- git-flow: `feature/*` merges into `develop` (`--no-ff`, "merges feature/x into develop").
- A release merges a `release/X.Y.Z` branch into `main` ("merges release/X.Y.Z into main") and is tagged `vX.Y.Z`.
- Pushing `main` publishes the site.
- Commit subjects are lowercase, third-person verb ("adds …", "fixes …"), with no body.
- Add a `CHANGELOG.md` entry for every release.
