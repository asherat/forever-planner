# Forever Planner

A personal gear planner for WoW: Forever characters. It runs as a plain web page opened from disk in Chrome. Your browser talks to Battle.net directly. There is no server.

## Use it (gaming PC)

1. Clone this repo (GitHub Desktop is fine).
2. Open `web/index.html` in Chrome. Bookmark it.
3. Settings → paste your Battle.net API client ID and secret (from https://develop.battle.net/access/clients). They are stored only in this browser and sent only to Battle.net.
4. Settings → add a character by first name and surname.
5. Log out in game, then press **Refresh**. Characters show up from level 10, after a logout.

To update: pull the repo, then reload the page.

Settings (characters, specs, weights, hidden items) live in this browser. Use **Save settings file** in Settings for a backup. The client secret is never included in that file.

## Rebuild the game data (dev machine)

`data/build.py` crawls Blizzard's Forever game data (items, quests, recipes) and writes `web/data/*.js`. It reads the API client from `~/.config/blizzard-api.env` and caches responses in `data/cache/` (not committed).

```
python3 -I data/build.py
```

## Branches

git-flow: `main` holds releases (tagged `vX.Y.Z`), `develop` is the integration branch, work happens on `feature/*`.
