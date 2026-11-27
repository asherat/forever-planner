# Forever Planner

A gear, leveling and crafting planner for World of Warcraft: Forever characters.

**Use it:** https://asherat.github.io/forever-planner/

It runs entirely in your browser. There is no server: your browser talks to Battle.net with your own API client, and reads local addon files only when you allow it.

## What it does

**Gear planner**

- Shows your character with its equipped gear, the way the game's character sheet does, with the next upgrade next to each slot. Hover any item to compare stats.
- Lists upgrades in order of value: for each slot the best upgrade within reach and a quicker option you can get now.
- Reads your specs from your talents and lets you choose main or off spec, cat or bear for feral druids, whether you mostly quest or run dungeons, and the most gold you want to spend on one upgrade. Questing on a PvP realm automatically values stamina and armor more, since other players will attack you.
- Only suggests items you can actually get: right faction and class, reputation within reach, quests you haven't completed, and a known source.
- Quest names, vendors and mobs that drop an item link to their Wowhead page.

**Leveling path**

- Pick the zones you want to level in. The planner knows each zone's level range and asks how to fill gaps between zones.
- Gear suggestions follow your path: quest rewards and drops only count for zones on it.

**Maps**

- Hover a zone in the leveling path, a vendor, drop, quest giver or dungeon entrance, or a recipe source to see where it is: the game's own continent map with the zone marked, and the zone map with a pin at the exact coordinates.
- Click coordinates in the quest list to copy a `/way` command for Questie or TomTom.

**Quest list**

- Add quest rewards to the quest list. It shows the next step of each quest chain you haven't completed and who gives it.

**Crafting**

- Collect crafted items in the crafting list and open them all in the crafting tool.
- The crafting tool expands each recipe and lets you choose per material: use what your characters have, buy from a vendor, buy on the auction house, or craft it. It shows the total, a shopping list, who has which materials and who can craft.

## Setup

1. Create a Battle.net API client at https://develop.battle.net/access/clients (any name; redirect URL `http://localhost`).
2. Open the planner, go to **Settings** and paste the client ID and secret. They are stored only in this browser and sent only to Battle.net.
3. Add your characters. Characters appear on Battle.net from level 10, after you log out.
4. Log out in game, then press **Refresh**.
5. Optional, on the PC where WoW is installed (Chrome or Edge): **Settings → Connect WoW folder** and pick your `World of Warcraft` or `_forever_` folder. This adds:
   - item sources (drops, vendors, quests) from the [Questie](https://www.curseforge.com/wow/addons/questie) addon,
   - auction prices and your characters' bags, bank and mail from [TradeSkillMaster](https://tradeskillmaster.com/).

   The planner only reads these files. WoW saves bag contents when a character logs out.

## Privacy

- Your Battle.net client secret stays in your browser's storage and is only sent to Battle.net to get an access token.
- Files from your WoW folder are read in the browser and never uploaded.
- To find reputation requirements that Battle.net leaves out, the planner looks up item tooltips on Wowhead. Only item numbers are sent.
- Settings (characters, leveling path, hidden items) live in your browser. **Settings → Backup** saves them to a file; the client secret is never included.

## Data sources and credits

- Item, quest, recipe and zone data: the Battle.net API (WoW: Forever namespaces).
- Items that Forever keeps out of the Battle.net API and the game files, with their stats and quest and reputation sources, plus the stat weights per spec: the [wowsims/forever](https://github.com/wowsims/forever) simulator's item database and presets (MIT).
- Random suffix stats: the game's `ItemBonus` and `RandPropPoints` tables for the WoW: Forever build, from [wago.tools](https://wago.tools).
- Item sources, quest levels and faction/class restrictions: your local QuestieDB install.
- Prices and inventory: your local TradeSkillMaster data.
- Dungeons and their minimum levels: the game's dungeon finder data (`LFGDungeons`, `ContentTuning`) for the WoW: Forever build, from wago.tools; each dungeon's quests from the Battle.net API; levels from your quests when Questie is connected.
- Maps: the game's own world map art (`UiMapArt` tiles) and zone positions (`UiMap`, `UiMapAssignment`) for the WoW: Forever build, from [wago.tools](https://wago.tools).
- Dungeon entrances: your local QuestieDB install (`dungeons.lua`).
- Zone tiers and notes: the video "Every Zone in WoW Forever RANKED WORST to BEST".
- Zone level ranges: Icy Veins, "Not Sure Where to Level in WoW Forever? Here's Every Zone from 1 to 60".
- Undocumented Forever API behaviour: [Pinta365/blizzard_api](https://github.com/Pinta365/blizzard_api) and its notes.

## Development

The site is built with Vite from `web/`. It's moving from plain JavaScript (`web/public/`) to TypeScript and Vue (`web/src/`). To try it locally (Battle.net refuses requests from `file://` pages):

```
npm install
npm run dev
```

`npm run build` writes the site to `dist/`, and `npm run typecheck` checks the TypeScript.

Tests:

```
npm test
python3 -m unittest discover -s tests -p "test_*.py"
```

Game data in `web/public/data/` is generated by `data/build.py`, which reads a Battle.net API client from `~/.config/blizzard-api.env` (`BLIZZARD_CLIENT_ID=…`, `BLIZZARD_CLIENT_SECRET=…`) and caches responses in `data/cache/` (not committed):

```
python3 -I data/build.py
```

The hover maps in `web/public/maps/` are built from the game's map tiles by `tools/build-maps.js`, after `data/build.py` (it reads `web/public/data/maps.js`). Downloaded tiles are cached in `data/cache/`, and each map is saved as a 560 px JPEG of about 50 KB:

```
npm install
node tools/build-maps.js
```

### Branches and releases

Release notes are in [CHANGELOG.md](CHANGELOG.md). Design decisions and code conventions are in [CLAUDE.md](CLAUDE.md).

git-flow: work happens on `feature/*`, which merges into `develop`. A release merges into `main` with a `vX.Y.Z` tag; every push to `main` publishes the site through GitHub Pages, and the version shows in the page header.

## License

MIT for the code. World of Warcraft data belongs to Blizzard Entertainment. See [LICENSE](LICENSE).
