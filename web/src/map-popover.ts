import { state } from "./state.ts";

const MAP_POPOVER_GAP = 8;
const MAP_IMAGE_DIRECTORY = "maps/";
const MAP_IMAGE_WIDTH = 560;
const MAP_IMAGE_HEIGHT = 373;

interface Pin {
  x: number;
  y: number;
}

export interface MapZone {
  uiMapId: number;
  continent: string;
  rectangle: [number, number, number, number];
}

export interface Place {
  zone: string;
  x: number | null;
  y: number | null;
  caption: string;
}

interface PlaceSource {
  zone: string;
  x?: number | null;
  y?: number | null;
  npc?: string;
}

function createElement(tagName: string, className: string, text?: string): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

export function mapZone(zoneName: string | undefined): MapZone | null {
  if (!window.FOREVER_MAPS || !zoneName) {
    return null;
  }
  return window.FOREVER_MAPS.zones[zoneName] || null;
}

function renderMapMarker(x: number, y: number, className: string): HTMLElement {
  const marker = createElement("span", className);
  marker.style.left = x + "%";
  marker.style.top = y + "%";
  return marker;
}

function renderMapFigure(uiMapId: number, markers: HTMLElement[], label: string): HTMLElement {
  const figure = createElement("div", "map-figure");
  const image = document.createElement("img");
  image.className = "map-image";
  image.src = MAP_IMAGE_DIRECTORY + uiMapId + ".jpg";
  image.alt = label;
  image.width = MAP_IMAGE_WIDTH;
  image.height = MAP_IMAGE_HEIGHT;
  figure.appendChild(image);
  for (const marker of markers) {
    figure.appendChild(marker);
  }
  return figure;
}

function continentMarkers(zone: MapZone, pins: Pin[]): HTMLElement[] {
  const rectangle = zone.rectangle;
  const markers: HTMLElement[] = [];
  if (pins.length === 0) {
    markers.push(renderMapMarker((rectangle[0] + rectangle[2]) * 50, (rectangle[1] + rectangle[3]) * 50, "map-marker map-marker-zone"));
    return markers;
  }
  for (const pin of pins) {
    const x = (rectangle[0] + (rectangle[2] - rectangle[0]) * pin.x / 100) * 100;
    const y = (rectangle[1] + (rectangle[3] - rectangle[1]) * pin.y / 100) * 100;
    markers.push(renderMapMarker(x, y, "map-marker"));
  }
  return markers;
}

function renderContinentMap(zoneName: string, pins: Pin[]): HTMLElement | null {
  const zone = mapZone(zoneName);
  if (zone === null) {
    return null;
  }
  const continent = window.FOREVER_MAPS.continents[zone.continent];
  const container = createElement("div", "map-views");
  container.appendChild(renderMapFigure(continent.uiMapId, continentMarkers(zone, pins), zone.continent + ", " + zoneName + " marked"));
  const zoneMarkers: HTMLElement[] = [];
  for (const pin of pins) {
    zoneMarkers.push(renderMapMarker(pin.x, pin.y, "map-marker"));
  }
  container.appendChild(renderMapFigure(zone.uiMapId, zoneMarkers, zoneName + " map"));
  return container;
}

function readMapTarget(element: HTMLElement): { zone: string; pins: Pin[]; caption: string } {
  const pins: Pin[] = [];
  if (element.dataset.mapX !== undefined && element.dataset.mapX !== "") {
    pins.push({ x: Number(element.dataset.mapX), y: Number(element.dataset.mapY) });
  }
  if (element.dataset.mapPins) {
    for (const pin of JSON.parse(element.dataset.mapPins) as Pin[]) {
      pins.push(pin);
    }
  }
  const zone = element.dataset.mapZone as string;
  return { zone: zone, pins: pins, caption: element.dataset.mapCaption || zone };
}

function mapPopover(): HTMLElement {
  let popover = document.getElementById("map-popover");
  if (popover === null) {
    popover = createElement("div", "map-popover");
    popover.id = "map-popover";
    popover.hidden = true;
    document.body.appendChild(popover);
  }
  return popover;
}

function showMapFor(element: HTMLElement): void {
  const target = readMapTarget(element);
  const map = renderContinentMap(target.zone, target.pins);
  if (map === null) {
    return;
  }
  const popover = mapPopover();
  popover.replaceChildren(map, createElement("div", "map-caption", target.caption));
  popover.hidden = false;
  const anchor = element.getBoundingClientRect();
  const box = popover.getBoundingClientRect();
  let left = anchor.left;
  if (left + box.width > window.innerWidth - MAP_POPOVER_GAP) {
    left = window.innerWidth - box.width - MAP_POPOVER_GAP;
  }
  let top = anchor.bottom + MAP_POPOVER_GAP;
  if (top + box.height > window.innerHeight - MAP_POPOVER_GAP) {
    top = anchor.top - box.height - MAP_POPOVER_GAP;
  }
  popover.style.left = Math.max(MAP_POPOVER_GAP, left) + "px";
  popover.style.top = Math.max(MAP_POPOVER_GAP, top) + "px";
}

function mapElement(event: Event): HTMLElement | null {
  return (event.target as HTMLElement).closest<HTMLElement>("[data-map-zone]");
}

function handleMapPointerOver(event: Event): void {
  const element = mapElement(event);
  if (element !== null) {
    showMapFor(element);
  }
}

function handleMapPointerOut(event: Event): void {
  const element = mapElement(event);
  const related = (event as MouseEvent).relatedTarget as Node | null;
  if (element !== null && !element.contains(related)) {
    mapPopover().hidden = true;
  }
}

export function enableMapPopovers(): void {
  document.addEventListener("mouseover", handleMapPointerOver);
  document.addEventListener("mouseout", handleMapPointerOut);
  document.addEventListener("focusin", handleMapPointerOver);
  document.addEventListener("focusout", handleMapPointerOut);
}

export function dungeonEntrance(dungeonName: string | undefined): { zone: string; x: number; y: number } | null {
  if (state.questie === null || !state.questie.dungeonEntrances || !dungeonName) {
    return null;
  }
  const entrances = state.questie.dungeonEntrances;
  if (entrances[dungeonName]) {
    return entrances[dungeonName];
  }
  for (const name of Object.keys(entrances)) {
    if (name.startsWith(dungeonName + ":")) {
      return entrances[name];
    }
  }
  return null;
}

function dungeonParentZone(dungeonName: string): string | null {
  if (!window.ZONE_GUIDE) {
    return null;
  }
  for (const zone of window.ZONE_GUIDE.zones) {
    for (const dungeon of zone.dungeons || []) {
      if (dungeon.name === dungeonName) {
        return zone.name;
      }
    }
  }
  return null;
}

export function placeForSource(source: PlaceSource): Place {
  const entrance = dungeonEntrance(source.zone);
  if (entrance !== null) {
    return { zone: entrance.zone, x: entrance.x, y: entrance.y, caption: source.zone + " entrance, " + entrance.zone + " (" + entrance.x.toFixed(1) + ", " + entrance.y.toFixed(1) + ")" };
  }
  const parentZone = dungeonParentZone(source.zone);
  if (parentZone !== null) {
    return { zone: parentZone, x: null, y: null, caption: source.zone + " is in " + parentZone + " (entrance not mapped yet)" };
  }
  let who = "";
  if (source.npc) {
    who = source.npc + ", ";
  }
  if (source.x === null || source.x === undefined) {
    return { zone: source.zone, x: null, y: null, caption: who + source.zone };
  }
  const y = source.y as number;
  return { zone: source.zone, x: source.x, y: y, caption: who + source.zone + " (" + source.x.toFixed(1) + ", " + y.toFixed(1) + ")" };
}
