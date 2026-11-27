import { markRaw } from "vue";
import { fetchFromBattleNet, mediaAsset } from "./battle-net.ts";
import { detectTalentSpecs } from "./scoring.ts";
import { itemById } from "./sources.ts";
import { saveSnapshots, setStatus, state } from "./state.ts";
import type { Character, Item, TalentSpecializations } from "./types.ts";

interface NamedType {
  type: string;
  name?: string;
}

export interface ProfileItem {
  item: { id: number };
  name: string;
  quality: NamedType;
  inventory_type: NamedType;
  slot: NamedType;
  item_subclass?: { name: string };
  armor?: { value: number };
  weapon?: { dps?: { value: number } };
  stats?: { type?: NamedType; value: number }[];
  spells?: { description?: string }[];
  enchantments?: { display_string: string }[];
}

export interface ProfileEquipment {
  equipped_items?: ProfileItem[];
}

export interface ProfileProfessions {
  primaries?: ProfileProfession[];
  secondaries?: ProfileProfession[];
}

interface ProfileProfession {
  profession: { name: string };
  skill_points?: number;
  tiers?: { skill_points: number; known_recipes?: { id: number }[] }[];
}

export interface Profession {
  name: string;
  skillPoints: number | undefined;
  recipeIds: number[];
}

interface Profile {
  last_login_timestamp: number;
  level: number;
  character_class: { name: string };
  race: { name: string };
  faction: NamedType;
  ruleset?: { name: string };
}

const FERAL_ATTACK_POWER = /\+(\d+) Attack Power in Cat, Bear, and Dire Bear forms only/;

function fetchProfile(slug: string, path: string): Promise<unknown> {
  return fetchFromBattleNet("/profile/wow/character/" + encodeURIComponent(slug) + path, "profile");
}

async function fetchItemIcon(itemId: number): Promise<string | null> {
  try {
    const media = await fetchFromBattleNet("/data/wow/media/item/" + itemId, "static");
    return mediaAsset(media as { assets?: { key: string; value: string }[] } | null, "icon");
  } catch (error) {
    return null;
  }
}

async function addEquipmentIcons(equippedBySlot: Record<string, Item>): Promise<void> {
  const slotKeys = Object.keys(equippedBySlot);
  const iconRequests: Promise<string | null>[] = [];
  for (const slotKey of slotKeys) {
    const known = itemById(equippedBySlot[slotKey].id);
    if (known !== null && known.icon) {
      equippedBySlot[slotKey].icon = known.icon;
      iconRequests.push(Promise.resolve(null));
    } else {
      iconRequests.push(fetchItemIcon(equippedBySlot[slotKey].id));
    }
  }
  const icons = await Promise.all(iconRequests);
  for (let index = 0; index < slotKeys.length; index += 1) {
    equippedBySlot[slotKeys[index]].iconUrl = icons[index];
  }
}

function itemStats(equippedItem: ProfileItem): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const stat of equippedItem.stats || []) {
    if (stat.type) {
      stats[stat.type.type] = stat.value;
    }
  }
  for (const spell of equippedItem.spells || []) {
    const match = FERAL_ATTACK_POWER.exec(spell.description || "");
    if (match !== null) {
      stats.FERAL_ATTACK_POWER = (stats.FERAL_ATTACK_POWER || 0) + Number(match[1]);
    }
  }
  return stats;
}

function compactItem(equippedItem: ProfileItem): Item {
  const record: Item = {
    id: equippedItem.item.id,
    name: equippedItem.name,
    quality: equippedItem.quality.type,
    armor: 0,
    slot: equippedItem.inventory_type.type,
    stats: itemStats(equippedItem),
    itemSubclass: "",
    effects: [],
    enchantments: []
  };
  if (equippedItem.item_subclass) {
    record.itemSubclass = equippedItem.item_subclass.name;
  }
  if (equippedItem.armor) {
    record.armor = equippedItem.armor.value;
  }
  for (const spell of equippedItem.spells || []) {
    if (spell.description) {
      record.effects.push(spell.description);
    }
  }
  if (equippedItem.weapon) {
    record.weapon = { damagePerSecond: 0 };
    if (equippedItem.weapon.dps) {
      record.weapon.damagePerSecond = equippedItem.weapon.dps.value;
    }
  }
  for (const enchantment of equippedItem.enchantments || []) {
    (record.enchantments as string[]).push(enchantment.display_string);
  }
  return record;
}

export function compactEquipment(equipment: ProfileEquipment | null): Record<string, Item> {
  const equippedBySlot: Record<string, Item> = {};
  if (equipment === null) {
    return equippedBySlot;
  }
  for (const equippedItem of equipment.equipped_items || []) {
    equippedBySlot[equippedItem.slot.type] = compactItem(equippedItem);
  }
  return equippedBySlot;
}

export function compactCompletedQuests(completed: { quests?: { id: number }[] } | null): number[] {
  const questIds: number[] = [];
  if (completed === null) {
    return questIds;
  }
  for (const quest of completed.quests || []) {
    questIds.push(quest.id);
  }
  return questIds;
}

export function compactReputations(reputations: { reputations?: { faction: { id: number }; standing: { tier: number } }[] } | null): Record<string, number> {
  const tiers: Record<string, number> = {};
  if (reputations === null) {
    return tiers;
  }
  for (const entry of reputations.reputations || []) {
    tiers[entry.faction.id] = entry.standing.tier;
  }
  return tiers;
}

export function compactProfessions(professions: ProfileProfessions | null): Profession[] {
  const names: Profession[] = [];
  if (professions === null) {
    return names;
  }
  for (const entry of (professions.primaries || []).concat(professions.secondaries || [])) {
    let skillPoints = entry.skill_points;
    const recipeIds: number[] = [];
    for (const tier of entry.tiers || []) {
      skillPoints = tier.skill_points;
      for (const recipe of tier.known_recipes || []) {
        recipeIds.push(recipe.id);
      }
    }
    names.push({ name: entry.profession.name, skillPoints: skillPoints, recipeIds: recipeIds });
  }
  return names;
}

export async function refreshCharacter(character: Character): Promise<void> {
  setStatus("Fetching " + character.displayName + " from Battle.net…", "info");
  const profile = await fetchProfile(character.slug, "") as Profile | null;
  if (profile === null) {
    throw new Error(character.displayName + " was not found. Characters appear from level 10, after logging out.");
  }
  const results = await Promise.all([
    fetchProfile(character.slug, "/equipment"),
    fetchProfile(character.slug, "/professions"),
    fetchProfile(character.slug, "/character-media"),
    fetchProfile(character.slug, "/specializations"),
    fetchProfile(character.slug, "/reputations"),
    fetchProfile(character.slug, "/quests/completed")
  ]);
  const equippedBySlot = compactEquipment(results[0] as ProfileEquipment | null);
  await addEquipmentIcons(equippedBySlot);
  let rulesetName = "";
  if (profile.ruleset) {
    rulesetName = profile.ruleset.name;
  }
  const media = results[2] as { assets?: { key: string; value: string }[] } | null;
  state.snapshots[character.slug] = markRaw({
    fetchedAt: new Date().toISOString(),
    lastLogout: profile.last_login_timestamp,
    level: profile.level,
    className: profile.character_class.name,
    raceName: profile.race.name,
    faction: profile.faction.name,
    factionType: profile.faction.type,
    ruleset: rulesetName,
    equipment: equippedBySlot,
    professions: compactProfessions(results[1] as ProfileProfessions | null),
    avatar: mediaAsset(media, "avatar"),
    render: mediaAsset(media, "main-raw"),
    talentSpecs: detectTalentSpecs(profile.character_class.name, results[3] as TalentSpecializations | null),
    reputations: compactReputations(results[4] as { reputations?: { faction: { id: number }; standing: { tier: number } }[] } | null),
    completedQuestIds: compactCompletedQuests(results[5] as { quests?: { id: number }[] } | null)
  });
  saveSnapshots();
  setStatus("Updated from your last logout (" + new Date(profile.last_login_timestamp).toLocaleString() + ").", "success");
}
