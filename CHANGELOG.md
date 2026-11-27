# Changelog

All notable changes to Forever Planner. Versions follow `vX.Y.Z` tags on `main`; the live site shows the current version in its header.

## v0.54.0 — 2026-11-27

- Behind the scenes: the leveling path panel now runs on Vue. It looks and works the same, hover maps included.

## v0.53.0 — 2026-11-27

- Behind the scenes: the first parts of the page now run on Vue (the Undo line and the "Not interested" list). They look and work the same.

## v0.52.0 — 2026-11-27

- Questie reading is rewritten in TypeScript, and that fixed a misreading: some creatures and containers showed up as "Unknown creature" or "Container" with wrong levels, now they have their real names (for example Witch Doctor Zum'rah in Zul'Farrak, as a boss).

## v0.51.0 — 2026-11-27

- Behind the scenes: the leveling path logic is rewritten in TypeScript, which finishes moving the planner's logic to typed code. Recommendations and the path editor are unchanged.

## v0.50.0 — 2026-11-27

- Behind the scenes: ranking upgrades, the quicker option and ring/trinket pairing are rewritten in TypeScript. Recommendations are unchanged.

## v0.49.0 — 2026-11-27

- Behind the scenes: where items come from (sources, reputation, prices, gold limit) is rewritten in TypeScript. Recommendations are unchanged.

## v0.48.0 — 2026-11-27

- Behind the scenes: item scoring (weights, random suffixes, proficiencies) is rewritten in TypeScript. Recommendations are unchanged.

## v0.47.0 — 2026-11-27

- Behind the scenes: TSM price and inventory reading is the first part rewritten in TypeScript. A TSM row with missing values no longer turns into a broken price.

## v0.46.0 — 2026-11-27

- Behind the scenes: the planner is now built with Vite, the first step of moving to TypeScript and Vue. Nothing changes on the page.

## v0.45.0 — 2026-11-27

- Fixed: random-stat items could still pass the gold limit through their any-suffix auction house price.
- Fixed: the gold limit used an auction house price even when nothing was listed.
- Fixed: a vendor item with an unknown price counted as a quick option under a gold limit.
- Fixed: on a leveling path, quest rewards ignored the quest's own level, and a zone you visit twice only counted its first visit.
- Fixed: dual-wielders could be offered the same quest-reward weapon for both hands.
- Fixed: an item sold by the other faction's vendor was hidden even when it also drops.
- Crafting costs on upgrade cards now use the same material prices as the crafting tool.
- Faster rendering, more tests, and a sturdier data builder.

## v0.44.0 — 2026-11-27

- Every dungeon counts automatically, on your leveling path or not; the dungeon list and the "Include …" checkboxes are gone. Upgrade cards from a dungeon have a "Skip <dungeon>" link when you're done with it or don't want to run it.
- "Not interested" and "Skip" show an Undo right away.
- Refresh tidies the not-interested list: items that aren't an upgrade for any of your specs anymore, and skipped dungeons with nothing left for you, are dropped from it.

## v0.43.0 — 2026-11-27

- "Add a dungeon" also leaves out dungeons more than 5 levels below you, even when they have a small upgrade.
- Fixed a horizontal scroll bar in the leveling path panel caused by long dungeon names in the menu.

## v0.42.0 — 2026-11-27

- "Add a dungeon" lists only dungeons with upgrades for you (boss and rare drops and quest rewards, for your spec and gold limit), with how many and how big the best one is: "Zul'Farrak (42+) · 11 upgrades, best +40". Without Questie connected it shows dungeons up to 5 levels below you instead.

## v0.41.0 — 2026-11-27

- "Add a dungeon" leaves out dungeons more than 10 levels below you. Dungeons you've already added stay.

## v0.40.0 — 2026-11-27

- The dungeon list and dungeon levels now come from the game's own dungeon finder data instead of a website: every WoW Forever dungeon plus the four classic raids, each from the level the game gives it. New dungeons appear by themselves after a data update.

## v0.39.0 — 2026-11-27

- A "Dungeons" list in the leveling path: add any of the 28 WoW Forever dungeons, on your path or not. Its boss drops count from the level its quests need (or Icy Veins' range without Questie), and its quests too when "Include its quests" is ticked.
- A zone's "Include …" checkbox now adds or removes its dungeons in that same list, so the two always match. Dungeons you'd already ticked move into the list.

## v0.38.0 — 2026-11-27

- Removed zones leave their levels empty in your path until you choose what to do, even after removing several zones or reloading. Each empty stretch asks where to level instead, and the path no longer says it reaches level 60 while levels are empty.

## v0.37.0 — 2026-11-27

- Items found in containers (chests and the like) no longer count as something you can go and get, like trash and world drops. The card still shows the container; the item is suggested only when it has another source or is on the auction house.

## v0.36.0 — 2026-11-27

- Removing a zone from the middle of your leveling path asks how to fill its levels: pick another zone for them, or let the next zone start earlier. Before, the next zone silently stretched back, even below its level range.
- A zone that starts before its level range shows a warning, like one that runs past it.

## v0.35.0 — 2026-11-27

- Random-stat items (like "Greater Maul of the Tiger") no longer count as something you can buy on the auction house. TSM's price covers every suffix together, so the one we suggest may cost much more or not be listed. Their cards show "AH … for any suffix" for information; crafted ones are unaffected.

## v0.34.0 — 2026-11-27

- "Max gold per upgrade" per character: upgrades that cost more to buy or craft are left out, and expensive auction house listings no longer count as a quick option.
- Auction house prices show what you pay per point of gain, e.g. "≈ 26s per attack power".
- Items that drop from many different creatures (trash and world drops) no longer count as something you can go and get; they show up only when they're on the auction house. Boss drops still count.
- Vendor items know their price, so the gold limit applies to them too.

## v0.33.0 — 2026-11-27

- When the best upgrade is something you'd have to buy on the auction house, the quicker option now shows the best one you can get without the auction house, such as a quest reward.

## v0.32.0 — 2026-11-27

- About 4,200 more items: the ones WoW Forever keeps hidden from Battle.net until players discover them, such as Bigger Rock on Bigger Stick from Eye of Mugg. They come from the WoW Forever simulator's item database, with their stats, quests and reputation requirements, so you see them before you get them.

## v0.31.0 — 2026-11-27

- Every class and spec has its own stat weights, taken from the WoW Forever simulator instead of a few shared presets. Upgrades show their gain in attack power, spell power, healing or stamina.
- Weapon damage counts per slot: hunters value their bow, dual-wielders value the off hand less than the main hand, and tanks value armor.
- Questing values hit and expertise at half (normal mobs need much less hit than dungeon bosses). Questing on a PvP realm still makes sure stamina counts.

## v0.30.0 — 2026-11-27

- Feral druids: weapon DPS now counts. In Forever, Cat and Bear form attacks use your weapon's damage (unlike Classic), so a high-DPS weapon can beat one with more stats. Weapon speed still doesn't matter.

## v0.29.0 — 2026-11-27

- Items with random stats ("…of the Tiger", "…of the Monkey") now count as upgrades. Each one is compared using the suffix that's best for your spec, and the card tells you which one to look for, e.g. "Wild Leather Helmet of the Tiger".

## v0.28.0 — 2026-11-26

- "Where do you play most?" has two choices: Questing and Dungeons. Questing on a PvP realm automatically values stamina and armor more, using the ruleset from your profile, and shows as "Questing (PvP realm)". A saved "World PvP" choice becomes questing.

## v0.27.0 — 2026-11-26

- Quest list shows the quests you can pick up right now in each chain, based on which prerequisites you've completed. Chains with parallel branches show each open branch, and a "done" count shows your progress.
- Refresh cleans up your lists: quests whose reward you've earned and items you've equipped are removed from the quest list and the crafting list.

## v0.26.0 — 2026-11-26

- Quest list: "Add quest upgrades (N)" adds the quest for every upgrade at once, and "Clear list" empties it.
- Quests from a zone you took off your leveling path are flagged, with a button to remove them.

## v0.25.0 — 2026-11-26

- The gear page compares only for the spec you selected. Upgrade cards and the header no longer show the other spec's gains.

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
