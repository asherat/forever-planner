import "../legacy.ts";
import type { GuideZone } from "../types.ts";
import { dungeonEntrance, mapZone } from "../map-popover.ts";

export type MapAttributes = Record<string, string>;

export function mapTargetAttributes(zoneName: string, x: number | null, y: number | null, caption: string): MapAttributes {
  const attributes: MapAttributes = {};
  if (mapZone(zoneName) === null) {
    return attributes;
  }
  attributes["data-map-zone"] = zoneName;
  if (x !== null && y !== null) {
    attributes["data-map-x"] = String(x);
    attributes["data-map-y"] = String(y);
  }
  if (caption) {
    attributes["data-map-caption"] = caption;
  }
  return attributes;
}

export function zoneMapAttributes(zone: GuideZone): MapAttributes {
  const pins: { x: number; y: number }[] = [];
  const captions = [zone.name];
  for (const dungeon of zone.dungeons || []) {
    const entrance = dungeonEntrance(dungeon.name);
    if (entrance !== null && entrance.zone === zone.name) {
      pins.push({ x: entrance.x, y: entrance.y });
      captions.push(dungeon.name + " entrance (" + entrance.x.toFixed(1) + ", " + entrance.y.toFixed(1) + ")");
    }
  }
  const attributes = mapTargetAttributes(zone.name, null, null, captions.join(" · "));
  if (pins.length > 0 && attributes["data-map-zone"]) {
    attributes["data-map-pins"] = JSON.stringify(pins);
  }
  return attributes;
}

export function hasMap(attributes: MapAttributes): boolean {
  return attributes["data-map-zone"] !== undefined;
}
