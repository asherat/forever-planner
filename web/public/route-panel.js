const SUGGESTED_READY_ZONES = 4;
const SUGGESTED_LATER_ZONES = 2;
const TIER_COLORS = { S: "tier-orange", A: "tier-yellow", B: "tier-green", C: "tier-grey", D: "tier-grey" };

function tierBadge(tier) {
  return createElement("span", "tier-badge " + TIER_COLORS[tier], tier);
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
