const MAX_CHARACTER_LEVEL = 60;
const LATER_ZONE_WINDOW = 5;
const SUGGESTED_READY_ZONES = 4;
const SUGGESTED_LATER_ZONES = 2;
const TIER_COLORS = { S: "tier-orange", A: "tier-yellow", B: "tier-green", C: "tier-grey", D: "tier-grey" };

const routeEditor = {
  pendingGap: null,
  showAllZones: false
};

function guideZone(zoneName) {
  for (const zone of window.ZONE_GUIDE.zones) {
    if (zone.name === zoneName) {
      return zone;
    }
  }
  return null;
}

function tierRank(tier) {
  return window.ZONE_GUIDE.tierOrder.indexOf(tier);
}

function zoneAllowedForFaction(zone, factionType) {
  return zone.faction === "both" || zone.faction === String(factionType).toLowerCase();
}

function characterRoute(character) {
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

function dungeonByName(dungeonName) {
  for (const dungeon of window.FOREVER_DUNGEONS) {
    if (dungeon.name === dungeonName) {
      return dungeon;
    }
  }
  return null;
}

function dungeonForArea(areaName) {
  for (const dungeon of window.FOREVER_DUNGEONS) {
    if (dungeon.areas.indexOf(areaName) !== -1) {
      return dungeon;
    }
  }
  return null;
}

function dungeonStartLevel(dungeon) {
  return dungeon.minLevel;
}

function routeLegs(character, snapshot) {
  const route = characterRoute(character);
  const legs = [];
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

function routeEndLevel(character, snapshot) {
  const legs = routeLegs(character, snapshot);
  if (legs.length === 0) {
    return snapshot.level;
  }
  return legs[legs.length - 1].toLevel;
}

function compareZoneSuggestions(first, second) {
  if (tierRank(first.tier) !== tierRank(second.tier)) {
    return tierRank(first.tier) - tierRank(second.tier);
  }
  return first.minLevel - second.minLevel;
}

function nextZoneSuggestions(level, factionType, previousZone) {
  const ready = [];
  const later = [];
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

function defaultLegEnd(zone, fromLevel) {
  return Math.min(MAX_CHARACTER_LEVEL, Math.max(fromLevel + 1, zone.maxLevel));
}

function addLeg(character, snapshot, zoneName, toLevel) {
  const route = characterRoute(character);
  if (route.legs.length === 0) {
    route.startLevel = snapshot.level;
  }
  route.legs.push({ zone: zoneName, toLevel: toLevel });
}

function legForSource(character, snapshot, source) {
  for (const leg of routeLegs(character, snapshot)) {
    if (leg.zone === source.zone) {
      return leg;
    }
  }
  const dungeon = dungeonForArea(source.zone);
  if (dungeon === null) {
    return null;
  }
  return { zone: dungeon.name, fromLevel: dungeonStartLevel(dungeon), toLevel: MAX_CHARACTER_LEVEL, dungeon: true };
}

function isRouteActive(character) {
  return Boolean(character.route && character.route.legs.length > 0);
}

function chooseZone(character, snapshot, zoneName) {
  const zone = guideZone(zoneName);
  const end = routeEndLevel(character, snapshot);
  if (zone.minLevel > end + 1) {
    routeEditor.pendingGap = { zone: zoneName, fromLevel: end, startLevel: zone.minLevel };
    return;
  }
  routeEditor.pendingGap = null;
  addLeg(character, snapshot, zoneName, defaultLegEnd(zone, end));
}

function resolveGap(character, snapshot, resolution, fillerZone) {
  const gap = routeEditor.pendingGap;
  const route = characterRoute(character);
  const zone = guideZone(gap.zone);
  if (resolution === "stay" && route.legs.length > 0) {
    route.legs[route.legs.length - 1].toLevel = gap.startLevel;
  } else if (resolution === "fill") {
    addLeg(character, snapshot, fillerZone, gap.startLevel);
  }
  const end = routeEndLevel(character, snapshot);
  addLeg(character, snapshot, gap.zone, defaultLegEnd(zone, end));
  routeEditor.pendingGap = null;
}

function tierBadge(tier) {
  return createElement("span", "tier-badge " + TIER_COLORS[tier], tier);
}

function zoneHasDungeon(zone, dungeonName) {
  for (const dungeon of zone.dungeons || []) {
    if (dungeon.name === dungeonName) {
      return true;
    }
  }
  return false;
}

function dungeonNames(zone) {
  const names = [];
  if (zone === null) {
    return names;
  }
  for (const dungeon of zone.dungeons || []) {
    names.push(dungeon.name);
  }
  return names;
}

function dungeonLabel(dungeon) {
  const known = dungeonByName(dungeon.name);
  if (known === null) {
    return dungeon.name;
  }
  return known.name + " (" + known.minLevel + "+)";
}

function setZoneMapTarget(element, zone) {
  const pins = [];
  const captions = [zone.name];
  for (const dungeon of zone.dungeons || []) {
    const entrance = dungeonEntrance(dungeon.name);
    if (entrance !== null && entrance.zone === zone.name) {
      pins.push({ x: entrance.x, y: entrance.y });
      captions.push(dungeon.name + " entrance (" + entrance.x.toFixed(1) + ", " + entrance.y.toFixed(1) + ")");
    }
  }
  setMapTarget(element, zone.name, null, null, captions.join(" · "));
  if (pins.length > 0) {
    element.dataset.mapPins = JSON.stringify(pins);
  }
}

function renderZoneChoice(zone, label) {
  const button = createElement("button", "zone-choice " + TIER_COLORS[zone.tier]);
  button.type = "button";
  button.dataset.chooseZone = zone.name;
  const title = createElement("span", "zone-choice-title");
  title.appendChild(tierBadge(zone.tier));
  title.append(" " + zone.name + " ");
  title.appendChild(createElement("span", "zone-range", label));
  button.appendChild(title);
  button.appendChild(createElement("span", "zone-note", zone.note));
  if (zone.dungeons && zone.dungeons.length > 0) {
    const labels = [];
    for (const dungeon of zone.dungeons) {
      labels.push(dungeonLabel(dungeon));
    }
    button.appendChild(createElement("span", "zone-dungeons", "Dungeons: " + labels.join(", ")));
  }
  setZoneMapTarget(button, zone);
  return button;
}

function renderLeg(leg, index, snapshot) {
  const zone = guideZone(leg.zone);
  let tier = "C";
  if (zone !== null) {
    tier = zone.tier;
  }
  const item = createElement("li", "route-leg " + TIER_COLORS[tier]);
  if (snapshot.level >= leg.fromLevel && snapshot.level < leg.toLevel) {
    item.classList.add("route-leg-current");
  }
  if (snapshot.level >= leg.toLevel) {
    item.classList.add("route-leg-done");
  }
  const header = createElement("div", "route-leg-header");
  header.appendChild(tierBadge(tier));
  const zoneLabel = createElement("span", "route-leg-zone", leg.zone);
  if (zone !== null) {
    setZoneMapTarget(zoneLabel, zone);
    zoneLabel.tabIndex = 0;
  }
  header.appendChild(zoneLabel);
  const removeButton = createElement("button", "link route-remove", "Remove");
  removeButton.type = "button";
  removeButton.dataset.removeLeg = String(index);
  header.appendChild(removeButton);
  item.appendChild(header);

  const levels = createElement("div", "route-leg-levels");
  levels.append("Level " + leg.fromLevel + " to ");
  const endInput = createElement("input", "route-end");
  endInput.type = "number";
  endInput.min = String(leg.fromLevel + 1);
  endInput.max = String(MAX_CHARACTER_LEVEL);
  endInput.value = String(leg.toLevel);
  endInput.id = "route-end-" + index;
  endInput.dataset.legEnd = String(index);
  endInput.setAttribute("aria-label", "Leave " + leg.zone + " at level");
  levels.appendChild(endInput);
  if (zone !== null && leg.toLevel > zone.maxLevel + 1) {
    levels.appendChild(createElement("span", "route-warning", " past the zone's range, quests turn green"));
  }
  if (zone !== null && leg.fromLevel + 1 < zone.minLevel) {
    levels.appendChild(createElement("span", "route-warning", " · starts before the zone's level " + zone.minLevel + ", quests will be harder"));
  }
  item.appendChild(levels);

  return item;
}

function renderGapResolver(character, snapshot, container) {
  const gap = routeEditor.pendingGap;
  const box = createElement("div", "route-gap");
  box.appendChild(createElement("p", null, gap.zone + " starts at level " + gap.startLevel + ", but your path reaches " + gap.fromLevel + ". How do you want to close the gap?"));
  const legs = routeLegs(character, snapshot);
  if (legs.length > 0) {
    const last = legs[legs.length - 1];
    const stay = createElement("button", "route-gap-option", "Stay in " + last.zone + " until " + gap.startLevel);
    stay.type = "button";
    stay.dataset.resolveGap = "stay";
    box.appendChild(stay);
  }
  const fillers = nextZoneSuggestions(gap.fromLevel, snapshot.factionType, gap.zone).ready;
  for (const zone of fillers.slice(0, 3)) {
    const fill = createElement("button", "route-gap-option " + TIER_COLORS[zone.tier]);
    fill.type = "button";
    fill.dataset.resolveGap = "fill";
    fill.dataset.fillerZone = zone.name;
    fill.appendChild(tierBadge(zone.tier));
    fill.append(" Fill " + gap.fromLevel + "–" + gap.startLevel + " in " + zone.name);
    box.appendChild(fill);
  }
  const early = createElement("button", "route-gap-option", "Start " + gap.zone + " early at " + gap.fromLevel + " (quests will be harder)");
  early.type = "button";
  early.dataset.resolveGap = "early";
  box.appendChild(early);
  const cancel = createElement("button", "link", "Cancel");
  cancel.type = "button";
  cancel.dataset.resolveGap = "cancel";
  box.appendChild(cancel);
  container.appendChild(box);
}

function renderRoutePanel(character, snapshot) {
  const container = document.getElementById("route-content");
  container.replaceChildren();
  renderPathEditor(character, snapshot, container);
}

function renderPathEditor(character, snapshot, container) {
  const legs = routeLegs(character, snapshot);
  if (legs.length > 0) {
    const list = createElement("ol", "route-legs");
    for (let index = 0; index < legs.length; index += 1) {
      if (legs[index].zone === null) {
        list.appendChild(renderEmptyLevels(legs[index], index, legs[index + 1].zone, snapshot));
      } else {
        list.appendChild(renderLeg(legs[index], index, snapshot));
      }
    }
    container.appendChild(list);
  }
  if (routeEditor.pendingGap !== null) {
    renderGapResolver(character, snapshot, container);
    return;
  }
  const end = routeEndLevel(character, snapshot);
  if (end >= MAX_CHARACTER_LEVEL && legs.some(isEmptyLeg)) {
    container.appendChild(createElement("p", "route-warning", "Your path has empty levels. Choose where to level for them above."));
    return;
  }
  if (end >= MAX_CHARACTER_LEVEL) {
    container.appendChild(createElement("p", "route-done", "Your path reaches level 60."));
    return;
  }
  let question = "Where are you leveling now?";
  let previousZone = null;
  if (legs.length > 0) {
    question = "From level " + end + ", where next?";
    previousZone = legs[legs.length - 1].zone;
  }
  container.appendChild(createElement("h3", "route-question", question));
  const suggestions = nextZoneSuggestions(end, snapshot.factionType, previousZone);
  const choices = createElement("div", "zone-choices");
  let ready = suggestions.ready;
  let later = suggestions.later;
  if (!routeEditor.showAllZones) {
    ready = ready.slice(0, SUGGESTED_READY_ZONES);
    later = later.slice(0, SUGGESTED_LATER_ZONES);
  }
  for (const zone of ready) {
    choices.appendChild(renderZoneChoice(zone, zone.minLevel + "–" + zone.maxLevel));
  }
  if (later.length > 0) {
    choices.appendChild(createElement("div", "zone-separator", "Needs a filler zone first"));
  }
  for (const zone of later) {
    choices.appendChild(renderZoneChoice(zone, "starts at " + zone.minLevel));
  }
  container.appendChild(choices);
  const hiddenCount = suggestions.ready.length + suggestions.later.length - ready.length - later.length;
  if (hiddenCount > 0 || routeEditor.showAllZones) {
    let toggleText = "Show all zones (" + hiddenCount + " more)";
    if (routeEditor.showAllZones) {
      toggleText = "Show fewer zones";
    }
    const toggle = createElement("button", "link", toggleText);
    toggle.type = "button";
    toggle.dataset.toggleZones = "true";
    container.appendChild(toggle);
  }
}

function updateLegEnd(character, snapshot, index, value) {
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

function isEmptyLeg(leg) {
  return leg !== undefined && leg.zone === null;
}

function mergeEmptyLegs(route, index) {
  const next = route.legs[index + 1];
  if (isEmptyLeg(next)) {
    route.legs[index].toLevel = next.toLevel;
    route.legs[index].removedZones = route.legs[index].removedZones.concat(next.removedZones);
    route.legs.splice(index + 1, 1);
  }
  const previous = route.legs[index - 1];
  if (isEmptyLeg(previous)) {
    previous.toLevel = route.legs[index].toLevel;
    previous.removedZones = previous.removedZones.concat(route.legs[index].removedZones);
    route.legs.splice(index, 1);
  }
}

function removeLeg(character, index) {
  const route = characterRoute(character);
  const removed = route.legs[index];
  if (index === route.legs.length - 1) {
    route.legs.splice(index, 1);
    while (route.legs.length > 0 && isEmptyLeg(route.legs[route.legs.length - 1])) {
      route.legs.pop();
    }
  } else {
    route.legs[index] = { zone: null, toLevel: removed.toLevel, removedZones: [removed.zone] };
    mergeEmptyLegs(route, index);
  }
  if (route.legs.length === 0) {
    route.startLevel = null;
  }
  routeEditor.pendingGap = null;
}

function fillEmptyLevels(character, index, zoneName) {
  const route = characterRoute(character);
  route.legs[index] = { zone: zoneName, toLevel: route.legs[index].toLevel };
}

function startNextZoneEarlier(character, index) {
  characterRoute(character).legs.splice(index, 1);
}

function renderEmptyLevels(leg, index, nextZone, snapshot) {
  const box = createElement("li", "route-gap");
  box.appendChild(createElement("p", null, "Levels " + leg.fromLevel + "–" + leg.toLevel + " are empty (you removed " + leg.removedZones.join(" and ") + "). Where do you want to level instead?"));
  const fillers = [];
  for (const zone of nextZoneSuggestions(leg.fromLevel, snapshot.factionType, nextZone).ready) {
    if (leg.removedZones.indexOf(zone.name) === -1) {
      fillers.push(zone);
    }
  }
  for (const zone of fillers.slice(0, 3)) {
    const fill = createElement("button", "route-gap-option " + TIER_COLORS[zone.tier]);
    fill.type = "button";
    fill.dataset.fillEmpty = zone.name;
    fill.dataset.emptyIndex = String(index);
    fill.appendChild(tierBadge(zone.tier));
    fill.append(" " + zone.name + " from " + leg.fromLevel + " to " + leg.toLevel);
    box.appendChild(fill);
  }
  let startEarlyText = "Start " + nextZone + " at " + leg.fromLevel;
  const next = guideZone(nextZone);
  if (next !== null && next.minLevel > leg.fromLevel + 1) {
    startEarlyText += " (quests will be harder)";
  }
  const stretch = createElement("button", "route-gap-option", startEarlyText);
  stretch.type = "button";
  stretch.dataset.startEarlier = String(index);
  box.appendChild(stretch);
  return box;
}

function handleRouteClick(event) {
  const target = event.target.closest("button");
  const character = selectedCharacter();
  if (target === null || character === null) {
    return;
  }
  const snapshot = state.snapshots[character.slug];
  if (target.dataset.chooseZone !== undefined) {
    chooseZone(character, snapshot, target.dataset.chooseZone);
    routeEditor.showAllZones = false;
  } else if (target.dataset.resolveGap !== undefined) {
    if (target.dataset.resolveGap === "cancel") {
      routeEditor.pendingGap = null;
    } else {
      resolveGap(character, snapshot, target.dataset.resolveGap, target.dataset.fillerZone);
    }
  } else if (target.dataset.toggleZones !== undefined) {
    routeEditor.showAllZones = !routeEditor.showAllZones;
  } else if (target.dataset.removeLeg !== undefined) {
    removeLeg(character, Number(target.dataset.removeLeg));
  } else if (target.dataset.fillEmpty !== undefined) {
    fillEmptyLevels(character, Number(target.dataset.emptyIndex), target.dataset.fillEmpty);
  } else if (target.dataset.startEarlier !== undefined) {
    startNextZoneEarlier(character, Number(target.dataset.startEarlier));
  } else {
    return;
  }
  saveSettings();
  render();
}

function handleRouteChange(event) {
  const target = event.target;
  const character = selectedCharacter();
  if (character === null) {
    return;
  }
  const snapshot = state.snapshots[character.slug];
  if (target.dataset.legEnd !== undefined) {
    updateLegEnd(character, snapshot, Number(target.dataset.legEnd), target.value);
  } else {
    return;
  }
  saveSettings();
  render();
}
