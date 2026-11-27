const FUTURE_UPGRADE_WEIGHT = 0.5;
const QUICKER_PASSES = ["easy-now", "easy-soon", "own-profession", "usable-now"];
const TOOLTIP_CHECKS_PER_SLOT = 5;

function rankedCandidatesForSlot(slotDefinition, snapshot, character) {
  const equipment = snapshot.equipment;
  if (slotDefinition.key === "OFF_HAND" && isTwoHanded(equipment.MAIN_HAND)) {
    return [];
  }
  const itemTypes = slotItemTypes(slotDefinition, snapshot);
  const maximumLevel = snapshot.level + Number(state.settings.lookaheadLevels);
  const weights = characterWeights(character);
  const equippedIds = equippedItemIds(snapshot);
  const hiddenIds = new Set(character.hiddenItemIds || []);
  const routeActive = isRouteActive(character);
  const candidates = [];
  for (const item of window.FOREVER_ITEMS) {
    if (itemTypes.indexOf(item.slot) === -1) {
      continue;
    }
    if (equippedIds.has(item.id) || hiddenIds.has(item.id)) {
      continue;
    }
    if (!canUseItem(item, snapshot)) {
      continue;
    }
    if (!isReputationWithinReach(item, snapshot)) {
      continue;
    }
    const variant = bestSuffixVariant(item, weights, slotDefinition.key);
    const gain = itemScore(variant, weights, slotDefinition.key) - comparisonBaseline(slotDefinition, snapshot, variant, weights);
    if (gain <= 0) {
      continue;
    }
    if (!hasKnownSource(variant, snapshot)) {
      continue;
    }
    if (!isWithinGoldLimit(cheapestCost(variant, snapshot))) {
      continue;
    }
    let availableLevel = Math.max(itemUsableLevel(item, snapshot), earliestSourceLevel(variant, snapshot));
    let routeLeg = null;
    if (routeActive) {
      const availability = routeAvailability(variant, snapshot, character);
      if (availability === null) {
        continue;
      }
      availableLevel = availability.level;
      routeLeg = availability.leg;
    }
    if (availableLevel > maximumLevel) {
      continue;
    }
    candidates.push({
      item: variant,
      availableLevel: availableLevel,
      routeLeg: routeLeg,
      gain: Math.round(gain * 10) / 10
    });
  }
  candidates.sort(compareCandidates);
  for (const candidate of candidates.slice(0, TOOLTIP_CHECKS_PER_SLOT)) {
    if (needsTooltipCheck(candidate.item, snapshot)) {
      tooltipChecks.pending.add(candidate.item.id);
    }
  }
  return candidates;
}

function routeAvailability(item, snapshot, character) {
  const usableLevel = itemUsableLevel(item, snapshot);
  const sources = obtainableSources(item, snapshot);
  if (sources.length === 0 || isBuyableOnAuctionHouse(item)) {
    return { level: usableLevel, leg: null };
  }
  let best = null;
  for (const source of sources) {
    if (source.type === "vendor" || source.type === "craft") {
      return { level: usableLevel, leg: null };
    }
    if (!source.zone) {
      continue;
    }
    for (const leg of legsForSource(character, snapshot, source)) {
      const level = Math.max(usableLevel, leg.fromLevel, source.level || 0);
      if (level > leg.toLevel + 1) {
        continue;
      }
      if (best === null || level < best.level) {
        best = { level: level, leg: leg };
      }
    }
  }
  return best;
}

function compareCandidates(first, second) {
  return second.gain - first.gain;
}

function isUsableNow(candidate, snapshot) {
  return candidate.availableLevel <= snapshot.level;
}

function quickerPassMatches(pass, candidate, snapshot) {
  if (pass === "easy-now") {
    return isUsableNow(candidate, snapshot) && hasEasySource(candidate.item, snapshot);
  }
  if (pass === "easy-soon") {
    return hasEasySource(candidate.item, snapshot);
  }
  if (pass === "own-profession") {
    return hasOwnProfessionCraft(candidate.item, snapshot);
  }
  return isUsableNow(candidate, snapshot);
}

function quickerOption(best, candidates, snapshot) {
  for (const pass of QUICKER_PASSES) {
    if (quickerPassMatches(pass, best, snapshot)) {
      return null;
    }
    for (const candidate of candidates) {
      if (candidate.item.name !== best.item.name && quickerPassMatches(pass, candidate, snapshot)) {
        return candidate;
      }
    }
  }
  return null;
}

function candidatePriority(candidate, snapshot) {
  if (isUsableNow(candidate, snapshot)) {
    return candidate.gain;
  }
  return candidate.gain * FUTURE_UPGRADE_WEIGHT;
}

function questOnlyIds(item, snapshot) {
  if (isBuyableOnAuctionHouse(item)) {
    return null;
  }
  const questIds = [];
  for (const source of obtainableSources(item, snapshot)) {
    if (source.type !== "quest") {
      return null;
    }
    questIds.push(source.questId);
  }
  return questIds;
}

function isBlockedByPartner(item, snapshot, blocked) {
  if (blocked.names.has(item.name)) {
    return true;
  }
  const questIds = questOnlyIds(item, snapshot);
  if (questIds === null || questIds.length === 0) {
    return false;
  }
  for (const questId of questIds) {
    if (!blocked.questIds.has(questId)) {
      return false;
    }
  }
  return true;
}

function blockPicks(options, snapshot, blocked) {
  const picks = [options.best];
  if (options.quicker !== null) {
    picks.push(options.quicker);
  }
  for (const pick of picks) {
    blocked.names.add(pick.item.name);
    for (const source of sourcesForCharacter(pick.item, snapshot)) {
      if (source.type === "quest") {
        blocked.questIds.add(source.questId);
      }
    }
  }
}

function blockQuestPicks(options, snapshot, blocked) {
  const picks = [options.best];
  if (options.quicker !== null) {
    picks.push(options.quicker);
  }
  for (const pick of picks) {
    for (const source of sourcesForCharacter(pick.item, snapshot)) {
      if (source.type === "quest") {
        blocked.questIds.add(source.questId);
      }
    }
  }
}

function emptyBlockList() {
  return { names: new Set(), questIds: new Set() };
}

function upgradeOptions(slotDefinition, snapshot, character, blocked) {
  const candidates = [];
  for (const candidate of rankedCandidatesForSlot(slotDefinition, snapshot, character)) {
    if (!isBlockedByPartner(candidate.item, snapshot, blocked)) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  const best = candidates[0];
  const quicker = quickerOption(best, candidates, snapshot);
  let priority = candidatePriority(best, snapshot);
  if (quicker !== null && candidatePriority(quicker, snapshot) > priority) {
    priority = candidatePriority(quicker, snapshot);
  }
  return { slotDefinition: slotDefinition, best: best, quicker: quicker, priority: priority };
}

function pairedUpgradeOptions(slotDefinition, snapshot, character) {
  const weights = characterWeights(character);
  const keys = [slotDefinition.key, slotDefinition.pairedWith];
  if (itemScore(snapshot.equipment[keys[1]], weights, keys[1]) < itemScore(snapshot.equipment[keys[0]], weights, keys[0])) {
    keys.reverse();
  }
  const blocked = emptyBlockList();
  const parts = [];
  let priority = 0;
  for (const key of keys) {
    const options = upgradeOptions(slotDefinitionByKey(key), snapshot, character, blocked);
    if (options === null) {
      continue;
    }
    parts.push(options);
    blockPicks(options, snapshot, blocked);
    if (options.priority > priority) {
      priority = options.priority;
    }
  }
  return { group: true, slotDefinition: slotDefinition, parts: parts, priority: priority };
}

function compareUpgradeOptions(first, second) {
  return second.priority - first.priority;
}

function isUpgradeForAnySpec(item, character, snapshot) {
  for (const specKey of characterSpecs(character, snapshot)) {
    if (bestGainAnySlot(item, snapshot, weightsForSpec(character, specKey)) > 0) {
      return true;
    }
  }
  return false;
}

function dungeonHasUpgrades(dungeonName, character, snapshot) {
  for (const item of window.FOREVER_ITEMS) {
    if (canUseItem(item, snapshot) && itemDungeons(item, snapshot).has(dungeonName) && isUpgradeForAnySpec(item, character, snapshot)) {
      return true;
    }
  }
  return false;
}
