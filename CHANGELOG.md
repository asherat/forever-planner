# Changelog

All notable changes to Forever Planner. Versions follow `vX.Y.Z` tags on `main`; the live site shows the current version in its header.

## v0.24.0 — 2026-11-26

- Mobs that drop an item link to their Wowhead page, on upgrade cards and for recipe drops in the crafting tool.
- Added this changelog and a project guide (`CLAUDE.md`) with the design decisions and conventions.

## v0.23.0 — 2026-11-26

- Quest names on upgrade cards and in the quest list link to Wowhead.
- Gear vendors and recipe vendors link to their Wowhead page.

## v0.22.0 — 2026-11-26

- Hover maps now use the game's own world map art instead of drawn shapes. Each map is about 50 KB and only downloads when you hover it.

## v0.21.0 — 2026-11-26

- Hover maps for leveling zones, vendors, drops, quest givers, dungeon entrances and recipe sources.

## v0.20.0 — 2026-11-26

- Quest list in the sidebar: shows the next step of each quest chain you haven't completed, who gives it and where, with a copyable `/way` command.

## v0.19.0 — 2026-11-26

- Settings dialog redesigned with tabs.
- Audit fixes: weapon proficiency rules (one-hand vs two-hand), settings import and region validation, per-source folder errors, saved lists with Lua comments, icon fetch failures, accessibility.
- Tests, a test workflow, an MIT license and a rewritten README.

## v0.18.2 — 2026-11-26

- Deploy workflow split into build and deploy jobs (fixes failed publishes).

## v0.18.1 — 2026-11-26

- Leveling path separates zones you can go to now from zones that need a filler zone first.

## v0.18.0 — 2026-11-26

- Zone level ranges and factions from Icy Veins' "Every Zone from 1 to 60" guide.
- Leveling path zone cards list each zone's dungeons.

## v0.17.0 — 2026-11-26

- Vendor and auction house prices are shown separately; vendor materials are preferred unless the auction house is much cheaper.
- Bartering (Legacy perk) vendor discount in the crafting tool.

## v0.16.0 — 2026-11-26

- Crafting list: "Add crafted upgrades" and "Clear list" buttons.

## v0.15.0 — 2026-11-26

- Rewards from quests you already completed are no longer suggested.
- Leveling path sits above the crafting list.

## v0.14.0 — 2026-11-26

- Leveling path and crafting list moved into a sidebar.
- Rings and trinkets are suggested as pairs, so both picks never come from the same quest.

## v0.13.0 — 2026-11-26

- Header shows only the version.

## v0.12.1 — 2026-11-26

- Version shown in the top bar.

## v0.12.0 — 2026-11-26

- Simpler upgrade cards: sources, auction house price and crafted price.
- Crafting list on the gear page with "Craft all", which opens the crafting tool.

## v0.11.0 — 2026-11-26

- Items without a known source are skipped.
- Quests are filtered by faction and class using Questie.

## v0.10.0 — 2026-11-26

- Missing reputation requirements are looked up in Wowhead item tooltips.
- Every slot always offers a quicker option you can actually reach.

## v0.9.0 — 2026-11-26

- Main/off spec selector, with cat/bear for feral druids.
- Test and placeholder items filtered out.

## v0.8.0 — 2026-11-26

- Crafting tool is scoped to a ruleset and faction instead of a character.

## v0.7.1 — 2026-11-26

- Fixes reading TradeSkillMaster and Questie files with Windows line endings.
- Inventory grouped by account; characters found in the WoW folder can be added in one click.

## v0.7.0 — 2026-11-26

- Leveling path editor with tier-ranked zones; gear suggestions follow the path.

## v0.6.0 — 2026-11-26

- Reputation items only suggested within reach of your current standing.
- Crafting tool shows buy and craft prices, known recipes and bind-on-pickup materials.

## v0.5.0 — 2026-11-26

- Crafting tool: recipe trees, materials from your characters' bags (TradeSkillMaster), shopping list, coin icons.

## v0.4.1 — 2026-11-26

- Fixes a settings crash and the browser offering to save the client secret as a password.
- Files are cache-busted per build.

## v0.4.0 — 2026-11-26

- Item sources from your local Questie install; reputation requirements taken into account.

## v0.3.0 — 2026-11-26

- Published on GitHub Pages instead of a Chrome extension.
- Specs detected from talents; stat weights replaced by a Questing / Dungeons / World PvP choice.
- Stat and comparison tooltips on the paper doll and upgrade list.

## v0.2.0 — 2026-11-26

- Character paper doll with an upgrade icon per slot and a prioritized upgrade list.
- Auction house prices and material costs from TradeSkillMaster.

## v0.1.0 — 2026-11-26

- First version: next upgrade per slot for two specs, built from Battle.net game data.
