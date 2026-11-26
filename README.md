# Forever Planner

A personal gear planner for WoW: Forever characters. It runs as a Chrome extension loaded straight from this repo. Your browser talks to Battle.net directly. There is no server.

Opening `web/index.html` as a plain file does not work: Battle.net refuses requests from `file://` pages.

## Use it (gaming PC)

1. Clone this repo (GitHub Desktop is fine).
2. In Chrome, open `chrome://extensions`, switch on **Developer mode**, click **Load unpacked** and pick the repo's `web` folder. Pin the extension to the toolbar.
3. Click the toolbar button to open the planner.
4. Settings → paste your Battle.net API client ID and secret (from https://develop.battle.net/access/clients). They are stored only in this browser and sent only to Battle.net.
5. Settings → add a character by first name and surname.
6. Log out in game, then press **Refresh**. Characters show up from level 10, after a logout.

To update: double-click `update.bat` in the repo folder (it runs `git pull`), then reload the planner tab. If an update changes `manifest.json`, also click the reload icon on the extension in `chrome://extensions`.

Settings (characters, playstyle, hidden items) live in this browser. Specs are read from each character's talents. Use **Save settings file** in Settings for a backup. The client secret is never included in that file.

## Rebuild the game data (dev machine)

`data/build.py` crawls Blizzard's Forever game data (items, quests, recipes) and writes `web/data/*.js`. It reads the API client from `~/.config/blizzard-api.env` and caches responses in `data/cache/` (not committed).

```
python3 -I data/build.py
```

## Branches

git-flow: `main` holds releases (tagged `vX.Y.Z`), `develop` is the integration branch, work happens on `feature/*`.
