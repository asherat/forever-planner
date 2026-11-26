# Forever Planner

A personal gear planner for WoW: Forever characters. It is a plain web page published with GitHub Pages at https://asherat.github.io/forever-planner/. Your browser talks to Battle.net directly. There is no server.

## Use it

1. Open https://asherat.github.io/forever-planner/ in Chrome and bookmark it.
2. Settings → paste your Battle.net API client ID and secret (from https://develop.battle.net/access/clients). They are stored only in this browser and sent only to Battle.net.
3. Settings → add a character by first name and surname.
4. Log out in game, then press **Refresh**. Characters show up from level 10, after a logout.
5. Optional: Settings → **Connect TSM prices** and pick `Interface/AddOns/TradeSkillMaster_AppHelper/AppData.lua`.

Updates go live when a release is merged to `main`; reload the page to get them.

Settings (characters, playstyle, hidden items) live in this browser. Specs are read from each character's talents. Use **Save settings file** in Settings for a backup. The client secret is never included in that file.

## Rebuild the game data (dev machine)

`data/build.py` crawls Blizzard's Forever game data (items, quests, recipes) and writes `web/data/*.js`. It reads the API client from `~/.config/blizzard-api.env` and caches responses in `data/cache/` (not committed).

```
python3 -I data/build.py
```

## Branches

git-flow: `main` holds releases (tagged `vX.Y.Z`), `develop` is the integration branch, work happens on `feature/*`.
