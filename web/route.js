const MAX_CHARACTER_LEVEL = 60;
const LATER_ZONE_WINDOW = 5;
const SUGGESTED_READY_ZONES = 4;
const SUGGESTED_LATER_ZONES = 2;
const ENDGAME_QUEST_LEVEL = 58;
const ENDGAME_ZONE_LEVEL = 55;
const MIN_QUESTS_FOR_RANGE = 5;
const MIN_QUESTS_PER_LEVEL = 2;
const MIN_BAND_COVERAGE = 0.5;
const BAND_LOWER_PERCENTILE = 0.1;
const BAND_UPPER_PERCENTILE = 0.9;
const TIER_COLORS = { S: "tier-orange", A: "tier-yellow", B: "tier-green", C: "tier-grey", D: "tier-grey" };

const routeEditor = {
  pendingGap: null,
  showAllZones: false
};

function selectedFactionType() {
  const character = selectedCharacter();
  if (character !== null && state.snapshots[character.slug]) {
    return state.snapshots[character.slug].factionType;
  }
  return "HORDE";
}

function effectiveZone(zone) {
  const range = zoneRange(zone, selectedFactionType());
  return Object.assign({}, zone, range);
}

function guideZone(zoneName) {
  for (const zone of window.ZONE_GUIDE.zones) {
    if (zone.name === zoneName) {
      return effectiveZone(zone);
    }
  }
  return null;
}

function levelHasQuests(counts, level, isEndgameZone) {
  if (level < 1 || (!isEndgameZone && level >= ENDGAME_QUEST_LEVEL)) {
    return false;
  }
  return (counts[level] || 0) >= MIN_QUESTS_PER_LEVEL;
}

function questLevelBand(counts, isEndgameZone) {
  const levels = [];
  for (const level of Object.keys(counts)) {
    if (isEndgameZone || Number(level) < ENDGAME_QUEST_LEVEL) {
      levels.push(Number(level));
    }
  }
  let total = 0;
  let peak = null;
  for (const level of levels) {
    total += counts[level];
    if (peak === null || counts[level] > counts[peak]) {
      peak = level;
    }
  }
  if (peak === null || total < MIN_QUESTS_FOR_RANGE) {
    return null;
  }
  let low = peak;
  while (true) {
    if (levelHasQuests(counts, low - 1, isEndgameZone)) {
      low -= 1;
    } else if (levelHasQuests(counts, low - 2, isEndgameZone)) {
      low -= 2;
    } else {
      break;
    }
  }
  let high = peak;
  while (true) {
    if (levelHasQuests(counts, high + 1, isEndgameZone)) {
      high += 1;
    } else if (levelHasQuests(counts, high + 2, isEndgameZone)) {
      high += 2;
    } else {
      break;
    }
  }
  let covered = 0;
  for (const level of levels) {
    if (level >= low && level <= high) {
      covered += counts[level];
    }
  }
  if (covered / total < MIN_BAND_COVERAGE) {
    return percentileBand(counts, levels, total);
  }
  return { minLevel: low, maxLevel: high };
}

function percentileBand(counts, levels, total) {
  levels.sort(compareNumbers);
  let seen = 0;
  let low = null;
  let high = null;
  for (const level of levels) {
    seen += counts[level];
    if (low === null && seen >= total * BAND_LOWER_PERCENTILE) {
      low = level;
    }
    if (high === null && seen >= total * BAND_UPPER_PERCENTILE) {
      high = level;
    }
  }
  return { minLevel: low, maxLevel: high };
}

function compareNumbers(first, second) {
  return first - second;
}

function zoneRange(zone, factionType) {
  const questie = state.questie;
  if (questie !== null && questie.zoneLevels && questie.zoneLevels[zone.name]) {
    const counts = questie.zoneLevels[zone.name][factionType];
    if (counts) {
      const band = questLevelBand(counts, zone.minLevel >= ENDGAME_ZONE_LEVEL);
      if (band !== null) {
        return { minLevel: band.minLevel, maxLevel: band.maxLevel, fromQuestie: true };
      }
    }
  }
  return { minLevel: zone.minLevel, maxLevel: zone.maxLevel, fromQuestie: false };
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
  return character.route;
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
    legs.push({ zone: leg.zone, fromLevel: level, toLevel: toLevel, dungeons: Boolean(leg.dungeons) });
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
  for (const guideEntry of window.ZONE_GUIDE.zones) {
    const zone = effectiveZone(guideEntry);
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
  route.legs.push({ zone: zoneName, toLevel: toLevel, dungeons: false });
}

function legForZone(character, snapshot, zoneName) {
  for (const leg of routeLegs(character, snapshot)) {
    if (leg.zone === zoneName) {
      return leg;
    }
    if (leg.dungeons) {
      const zone = guideZone(leg.zone);
      if (zone !== null && (zone.dungeons || []).indexOf(zoneName) !== -1) {
        return leg;
      }
    }
  }
  return null;
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
  header.appendChild(createElement("span", "route-leg-zone", leg.zone));
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
  item.appendChild(levels);

  if (zone !== null && zone.dungeons && zone.dungeons.length > 0) {
    const dungeonLine = createElement("label", "checkbox-line route-dungeons");
    const checkbox = createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = leg.dungeons;
    checkbox.dataset.legDungeons = String(index);
    dungeonLine.appendChild(checkbox);
    dungeonLine.append(" Include " + zone.dungeons.join(", "));
    item.appendChild(dungeonLine);
  }
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
  const legs = routeLegs(character, snapshot);
  if (legs.length > 0) {
    const list = createElement("ol", "route-legs");
    for (let index = 0; index < legs.length; index += 1) {
      list.appendChild(renderLeg(legs[index], index, snapshot));
    }
    container.appendChild(list);
  }
  if (routeEditor.pendingGap !== null) {
    renderGapResolver(character, snapshot, container);
    return;
  }
  const end = routeEndLevel(character, snapshot);
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

function removeLeg(character, index) {
  const route = characterRoute(character);
  route.legs.splice(index, 1);
  if (route.legs.length === 0) {
    route.startLevel = null;
  }
  routeEditor.pendingGap = null;
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
  } else if (target.dataset.legDungeons !== undefined) {
    characterRoute(character).legs[Number(target.dataset.legDungeons)].dungeons = target.checked;
  } else {
    return;
  }
  saveSettings();
  render();
}
