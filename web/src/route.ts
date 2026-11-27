import "./legacy.ts";
import type { Character, GuideDungeon, GuideZone, ItemSource, RouteLeg, SavedLeg, SavedRoute, Snapshot } from "./types.ts";

export const MAX_CHARACTER_LEVEL = 60;
const LATER_ZONE_WINDOW = 5;

export interface PendingGap {
  zone: string;
  fromLevel: number;
  startLevel: number;
}

export const routeEditor: { pendingGap: PendingGap | null; showAllZones: boolean } = {
  pendingGap: null,
  showAllZones: false
};

export function guideZone(zoneName: string | null | undefined): GuideZone | null {
  for (const zone of window.ZONE_GUIDE.zones) {
    if (zone.name === zoneName) {
      return zone;
    }
  }
  return null;
}

function tierRank(tier: string): number {
  return window.ZONE_GUIDE.tierOrder.indexOf(tier);
}

function zoneAllowedForFaction(zone: GuideZone, factionType: string): boolean {
  return zone.faction === "both" || zone.faction === String(factionType).toLowerCase();
}

export function characterRoute(character: Character): SavedRoute {
  if (!character.route) {
    character.route = { startLevel: null, legs: [] };
  }
  if (character.route.dungeons) {
    delete character.route.dungeons;
    for (const leg of character.route.legs) {
      delete leg.dungeons;
    }
  }
  return character.route;
}

export function dungeonByName(dungeonName: string): GuideDungeon | null {
  for (const dungeon of window.FOREVER_DUNGEONS) {
    if (dungeon.name === dungeonName) {
      return dungeon;
    }
  }
  return null;
}

export function dungeonForArea(areaName: string | undefined): GuideDungeon | null {
  if (areaName === undefined) {
    return null;
  }
  for (const dungeon of window.FOREVER_DUNGEONS) {
    if (dungeon.areas.indexOf(areaName) !== -1) {
      return dungeon;
    }
  }
  return null;
}

export function dungeonStartLevel(dungeon: GuideDungeon): number {
  return dungeon.minLevel;
}

export function routeLegs(character: Character, snapshot: Snapshot): RouteLeg[] {
  const route = characterRoute(character);
  const legs: RouteLeg[] = [];
  let level = route.startLevel || snapshot.level;
  for (const leg of route.legs) {
    let toLevel = leg.toLevel;
    if (toLevel <= level) {
      toLevel = level + 1;
    }
    legs.push({ zone: leg.zone, fromLevel: level, toLevel: toLevel, removedZones: leg.removedZones || [] });
    level = toLevel;
  }
  return legs;
}

export function routeEndLevel(character: Character, snapshot: Snapshot): number {
  const legs = routeLegs(character, snapshot);
  if (legs.length === 0) {
    return snapshot.level;
  }
  return legs[legs.length - 1].toLevel;
}

function compareZoneSuggestions(first: GuideZone, second: GuideZone): number {
  if (tierRank(first.tier) !== tierRank(second.tier)) {
    return tierRank(first.tier) - tierRank(second.tier);
  }
  return first.minLevel - second.minLevel;
}

export function nextZoneSuggestions(level: number, factionType: string, previousZone: string | null): { ready: GuideZone[]; later: GuideZone[] } {
  const ready: GuideZone[] = [];
  const later: GuideZone[] = [];
  for (const zone of window.ZONE_GUIDE.zones) {
    if (!zoneAllowedForFaction(zone, factionType) || zone.name === previousZone) {
      continue;
    }
    if (zone.minLevel <= level + 1 && level < zone.maxLevel) {
      ready.push(zone);
    } else if (zone.minLevel > level + 1 && zone.minLevel <= level + LATER_ZONE_WINDOW) {
      later.push(zone);
    }
  }
  ready.sort(compareZoneSuggestions);
  later.sort(compareZoneSuggestions);
  return { ready: ready, later: later };
}

function defaultLegEnd(zone: GuideZone, fromLevel: number): number {
  return Math.min(MAX_CHARACTER_LEVEL, Math.max(fromLevel + 1, zone.maxLevel));
}

function addLeg(character: Character, snapshot: Snapshot, zoneName: string, toLevel: number): void {
  const route = characterRoute(character);
  if (route.legs.length === 0) {
    route.startLevel = snapshot.level;
  }
  route.legs.push({ zone: zoneName, toLevel: toLevel });
}

function dungeonLeg(dungeon: GuideDungeon): RouteLeg {
  return { zone: dungeon.name, fromLevel: dungeonStartLevel(dungeon), toLevel: MAX_CHARACTER_LEVEL, dungeon: true };
}

export function legsForSource(character: Character, snapshot: Snapshot, source: ItemSource): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (const leg of routeLegs(character, snapshot)) {
    if (leg.zone === source.zone) {
      legs.push(leg);
    }
  }
  const dungeon = dungeonForArea(source.zone);
  if (dungeon !== null) {
    legs.push(dungeonLeg(dungeon));
  }
  return legs;
}

export function legForSource(character: Character, snapshot: Snapshot, source: ItemSource): RouteLeg | null {
  const legs = legsForSource(character, snapshot, source);
  if (legs.length === 0) {
    return null;
  }
  return legs[0];
}

export function isRouteActive(character: Character): boolean {
  return Boolean(character.route && character.route.legs.length > 0);
}

export function chooseZone(character: Character, snapshot: Snapshot, zoneName: string): void {
  const zone = guideZone(zoneName);
  if (zone === null) {
    return;
  }
  const end = routeEndLevel(character, snapshot);
  if (zone.minLevel > end + 1) {
    routeEditor.pendingGap = { zone: zoneName, fromLevel: end, startLevel: zone.minLevel };
    return;
  }
  routeEditor.pendingGap = null;
  addLeg(character, snapshot, zoneName, defaultLegEnd(zone, end));
}

export function resolveGap(character: Character, snapshot: Snapshot, resolution: string, fillerZone: string | undefined): void {
  const gap = routeEditor.pendingGap;
  if (gap === null) {
    return;
  }
  const route = characterRoute(character);
  const zone = guideZone(gap.zone);
  if (resolution === "stay" && route.legs.length > 0) {
    route.legs[route.legs.length - 1].toLevel = gap.startLevel;
  } else if (resolution === "fill" && fillerZone !== undefined) {
    addLeg(character, snapshot, fillerZone, gap.startLevel);
  }
  if (zone !== null) {
    addLeg(character, snapshot, gap.zone, defaultLegEnd(zone, routeEndLevel(character, snapshot)));
  }
  routeEditor.pendingGap = null;
}

export function updateLegEnd(character: Character, snapshot: Snapshot, index: number, value: string): void {
  const route = characterRoute(character);
  const legs = routeLegs(character, snapshot);
  const level = Math.max(legs[index].fromLevel + 1, Math.min(MAX_CHARACTER_LEVEL, Number(value) || legs[index].toLevel));
  route.legs[index].toLevel = level;
  const kept = route.legs.slice(0, index + 1);
  for (const leg of route.legs.slice(index + 1)) {
    if (leg.toLevel > level) {
      kept.push(leg);
    }
  }
  route.legs = kept;
}

export function isEmptyLeg(leg: SavedLeg | RouteLeg | undefined): boolean {
  return leg !== undefined && leg.zone === null;
}

function mergeEmptyLegs(route: SavedRoute, index: number): void {
  const next = route.legs[index + 1];
  if (next !== undefined && isEmptyLeg(next)) {
    route.legs[index].toLevel = next.toLevel;
    route.legs[index].removedZones = (route.legs[index].removedZones || []).concat(next.removedZones || []);
    route.legs.splice(index + 1, 1);
  }
  const previous = route.legs[index - 1];
  if (previous !== undefined && isEmptyLeg(previous)) {
    previous.toLevel = route.legs[index].toLevel;
    previous.removedZones = (previous.removedZones || []).concat(route.legs[index].removedZones || []);
    route.legs.splice(index, 1);
  }
}

export function removeLeg(character: Character, index: number): void {
  const route = characterRoute(character);
  const removed = route.legs[index];
  if (index === route.legs.length - 1) {
    route.legs.splice(index, 1);
    while (route.legs.length > 0 && isEmptyLeg(route.legs[route.legs.length - 1])) {
      route.legs.pop();
    }
  } else {
    const removedZones: string[] = [];
    if (removed.zone !== null) {
      removedZones.push(removed.zone);
    }
    route.legs[index] = { zone: null, toLevel: removed.toLevel, removedZones: removedZones };
    mergeEmptyLegs(route, index);
  }
  if (route.legs.length === 0) {
    route.startLevel = null;
  }
  routeEditor.pendingGap = null;
}

export function fillEmptyLevels(character: Character, index: number, zoneName: string): void {
  const route = characterRoute(character);
  route.legs[index] = { zone: zoneName, toLevel: route.legs[index].toLevel };
}

export function startNextZoneEarlier(character: Character, index: number): void {
  characterRoute(character).legs.splice(index, 1);
}
