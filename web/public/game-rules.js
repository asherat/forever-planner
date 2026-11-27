window.GAME_RULES = {
  equipmentSlots: [
    { key: "HEAD", label: "Head", column: "left", itemSlots: ["HEAD"] },
    { key: "NECK", label: "Neck", column: "left", itemSlots: ["NECK"] },
    { key: "SHOULDER", label: "Shoulders", column: "left", itemSlots: ["SHOULDER"] },
    { key: "BACK", label: "Back", column: "left", itemSlots: ["CLOAK"] },
    { key: "CHEST", label: "Chest", column: "left", itemSlots: ["CHEST", "ROBE"] },
    { key: "SHIRT", label: "Shirt", column: "left", itemSlots: [], cosmetic: true },
    { key: "TABARD", label: "Tabard", column: "left", itemSlots: [], cosmetic: true },
    { key: "WRIST", label: "Wrist", column: "left", itemSlots: ["WRIST"] },
    { key: "HANDS", label: "Hands", column: "right", itemSlots: ["HAND"] },
    { key: "WAIST", label: "Waist", column: "right", itemSlots: ["WAIST"] },
    { key: "LEGS", label: "Legs", column: "right", itemSlots: ["LEGS"] },
    { key: "FEET", label: "Feet", column: "right", itemSlots: ["FEET"] },
    { key: "FINGER_1", label: "Ring", column: "right", itemSlots: ["FINGER"], pairedWith: "FINGER_2", groupLabel: "Rings" },
    { key: "FINGER_2", label: "Ring", column: "right", itemSlots: ["FINGER"], pairedWith: "FINGER_1", groupLabel: "Rings" },
    { key: "TRINKET_1", label: "Trinket", column: "right", itemSlots: ["TRINKET"], pairedWith: "TRINKET_2", groupLabel: "Trinkets" },
    { key: "TRINKET_2", label: "Trinket", column: "right", itemSlots: ["TRINKET"], pairedWith: "TRINKET_1", groupLabel: "Trinkets" },
    { key: "MAIN_HAND", label: "Main hand", column: "bottom", itemSlots: ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"] },
    { key: "OFF_HAND", label: "Off hand", column: "bottom", itemSlots: ["SHIELD", "HOLDABLE"] },
    { key: "RANGED", label: "Ranged / relic", column: "bottom", itemSlots: ["RANGED", "RANGEDRIGHT", "THROWN", "RELIC"] }
  ],

  classProficiencies: {
    "Druid": {
      armor: ["Cloth", "Leather", "Miscellaneous", "Idol"],
      oneHand: ["Mace", "Dagger", "Fist Weapon"],
      twoHand: ["Staff", "Mace", "Polearm"],
      ranged: [],
      dualWield: false
    },
    "Warrior": {
      armor: ["Cloth", "Leather", "Mail", "Plate", "Shield", "Miscellaneous"],
      oneHand: ["Axe", "Sword", "Mace", "Dagger", "Fist Weapon"],
      twoHand: ["Axe", "Sword", "Mace", "Polearm", "Staff"],
      ranged: ["Bow", "Gun", "Crossbow", "Thrown"],
      dualWield: true
    },
    "Paladin": {
      armor: ["Cloth", "Leather", "Mail", "Plate", "Shield", "Libram", "Miscellaneous"],
      oneHand: ["Axe", "Sword", "Mace"],
      twoHand: ["Axe", "Sword", "Mace", "Polearm"],
      ranged: [],
      dualWield: false
    },
    "Hunter": {
      armor: ["Cloth", "Leather", "Mail", "Miscellaneous"],
      oneHand: ["Axe", "Sword", "Dagger", "Fist Weapon"],
      twoHand: ["Axe", "Sword", "Polearm", "Staff"],
      ranged: ["Bow", "Gun", "Crossbow", "Thrown"],
      dualWield: true
    },
    "Rogue": {
      armor: ["Cloth", "Leather", "Miscellaneous"],
      oneHand: ["Dagger", "Sword", "Mace", "Fist Weapon"],
      twoHand: [],
      ranged: ["Bow", "Gun", "Crossbow", "Thrown"],
      dualWield: true
    },
    "Priest": {
      armor: ["Cloth", "Miscellaneous"],
      oneHand: ["Mace", "Dagger"],
      twoHand: ["Staff"],
      ranged: ["Wand"],
      dualWield: false
    },
    "Shaman": {
      armor: ["Cloth", "Leather", "Mail", "Shield", "Totem", "Miscellaneous"],
      oneHand: ["Axe", "Mace", "Dagger", "Fist Weapon"],
      twoHand: ["Axe", "Mace", "Staff"],
      ranged: [],
      dualWield: false
    },
    "Mage": {
      armor: ["Cloth", "Miscellaneous"],
      oneHand: ["Sword", "Dagger"],
      twoHand: ["Staff"],
      ranged: ["Wand"],
      dualWield: false
    },
    "Warlock": {
      armor: ["Cloth", "Miscellaneous"],
      oneHand: ["Sword", "Dagger"],
      twoHand: ["Staff"],
      ranged: ["Wand"],
      dualWield: false
    }
  },

  classSpecs: {
    "Druid": ["druid-feral-cat", "druid-feral-bear", "druid-restoration", "druid-balance"],
    "Warrior": ["warrior-arms", "warrior-fury", "warrior-protection"],
    "Paladin": ["paladin-retribution", "paladin-protection", "paladin-holy"],
    "Hunter": ["hunter-beast-mastery", "hunter-marksmanship", "hunter-survival"],
    "Rogue": ["rogue-combat", "rogue-assassination", "rogue-subtlety"],
    "Priest": ["priest-shadow", "priest-holy", "priest-discipline"],
    "Shaman": ["shaman-enhancement", "shaman-elemental", "shaman-restoration"],
    "Mage": ["mage-frost", "mage-fire", "mage-arcane"],
    "Warlock": ["warlock-affliction", "warlock-demonology", "warlock-destruction"]
  },

  specs: {
    "druid-feral-cat": { label: "Feral (cat)", preset: "feral-cat", talentTree: "Feral Combat" },
    "druid-feral-bear": { label: "Feral (bear)", preset: "feral-bear" },
    "druid-restoration": { label: "Restoration", preset: "healer", talentTree: "Restoration" },
    "druid-balance": { label: "Balance", preset: "druid-balance", talentTree: "Balance" },
    "warrior-arms": { label: "Arms", preset: "warrior-arms", talentTree: "Arms" },
    "warrior-fury": { label: "Fury", preset: "warrior-fury", talentTree: "Fury" },
    "warrior-protection": { label: "Protection", preset: "plate-tank", talentTree: "Protection" },
    "paladin-retribution": { label: "Retribution", preset: "paladin-retribution", talentTree: "Retribution" },
    "paladin-protection": { label: "Protection", preset: "plate-tank", talentTree: "Protection" },
    "paladin-holy": { label: "Holy", preset: "healer", talentTree: "Holy" },
    "hunter-beast-mastery": { label: "Beast Mastery", preset: "hunter-ranged", talentTree: "Beast Mastery" },
    "hunter-marksmanship": { label: "Marksmanship", preset: "hunter-ranged", talentTree: "Marksmanship" },
    "hunter-survival": { label: "Survival", preset: "hunter-melee", talentTree: "Survival" },
    "rogue-combat": { label: "Combat", preset: "rogue-combat", talentTree: "Combat" },
    "rogue-assassination": { label: "Assassination", preset: "rogue-assassination", talentTree: "Assassination" },
    "rogue-subtlety": { label: "Subtlety", preset: "rogue-subtlety", talentTree: "Subtlety" },
    "priest-shadow": { label: "Shadow", preset: "priest-shadow", talentTree: "Shadow" },
    "priest-holy": { label: "Holy", preset: "healer", talentTree: "Holy" },
    "priest-discipline": { label: "Discipline", preset: "priest-discipline", talentTree: "Discipline" },
    "shaman-enhancement": { label: "Enhancement", preset: "shaman-enhancement", talentTree: "Enhancement" },
    "shaman-elemental": { label: "Elemental", preset: "shaman-elemental", talentTree: "Elemental" },
    "shaman-restoration": { label: "Restoration", preset: "healer", talentTree: "Restoration" },
    "mage-frost": { label: "Frost", preset: "mage-frost", talentTree: "Frost" },
    "mage-fire": { label: "Fire", preset: "mage-fire", talentTree: "Fire" },
    "mage-arcane": { label: "Arcane", preset: "mage-arcane", talentTree: "Arcane" },
    "warlock-affliction": { label: "Affliction", preset: "warlock-affliction", talentTree: "Affliction" },
    "warlock-demonology": { label: "Demonology", preset: "warlock-demonology", talentTree: "Demonology" },
    "warlock-destruction": { label: "Destruction", preset: "warlock-destruction", talentTree: "Destruction" }
  },

  feralSpecs: { cat: "druid-feral-cat", bear: "druid-feral-bear" },

  playstyles: {
    "questing": { label: "Questing", multipliers: { HIT_RATING: 0.5, EXPERTISE_RATING: 0.5 }, pvpRulesetLabel: "Questing (PvP realm)", pvpRulesetStaminaShare: 0.6 },
    "dungeons": { label: "Dungeons", multipliers: {} }
  },

  pvpRuleset: "PvP",

  defaultPlaystyle: "questing",

  specPresets: {
    "feral-cat": { unit: "attack power", weights: { STRENGTH: 2.44, AGILITY: 2.69, ATTACK_POWER: 1.0, FERAL_ATTACK_POWER: 1.0, HIT_RATING: 2.14, CRIT_RATING: 2.07, HASTE_RATING: 1.61, EXPERTISE_RATING: 2.01, MAIN_HAND_DPS: 8.79 } },
    "feral-bear": { unit: "stamina", weights: { STRENGTH: 0.48, AGILITY: 0.43, STAMINA: 1.0, ATTACK_POWER: 0.22, FERAL_ATTACK_POWER: 0.22, HIT_RATING: 0.69, CRIT_RATING: 0.36, HASTE_RATING: 0.36, EXPERTISE_RATING: 1.77, DEFENSE_SKILL_RATING: 0.87, DODGE_RATING: 0.11, ARMOR: 0.17, EXTRA_ARMOR: 0.17, MAIN_HAND_DPS: 3.08 } },
    "warrior-arms": { unit: "attack power", weights: { STRENGTH: 2.2, AGILITY: 1.76, ATTACK_POWER: 1.0, HIT_RATING: 5.03, HASTE_RATING: 1.29, CRIT_RATING: 2.32, EXPERTISE_RATING: 1.57, MAIN_HAND_DPS: 16.71 } },
    "warrior-fury": { unit: "attack power", weights: { STRENGTH: 2.2, AGILITY: 1.7, ATTACK_POWER: 1.0, HIT_RATING: 1.69, HASTE_RATING: 1.76, CRIT_RATING: 2.26, EXPERTISE_RATING: 2.35, MAIN_HAND_DPS: 12.59, OFF_HAND_DPS: 2.66 } },
    "plate-tank": { unit: "stamina", weights: { STAMINA: 1.0, STRENGTH: 0.54, AGILITY: 0.57, ATTACK_POWER: 0.23, HIT_RATING: 0.03, CRIT_RATING: 0.37, HASTE_RATING: 0.15, EXPERTISE_RATING: 2.04, DEFENSE_SKILL_RATING: 0.46, BLOCK_VALUE: 0.66, DODGE_RATING: 0.25, PARRY_RATING: 0.23, ARMOR: 0.05, EXTRA_ARMOR: 0.05, MAIN_HAND_DPS: 1.23 } },
    "paladin-retribution": { unit: "attack power", weights: { STRENGTH: 2.4, AGILITY: 1.91, INTELLECT: 1.48, SPELL_POWER: 1.95, SPELL_DAMAGE_DONE: 1.95, BONUS_STAT_HOLY_DAMAGE_DONE: 1.59, SPELL_PENETRATION: 0.66, ATTACK_POWER: 1.0, HIT_RATING: 7.76, CRIT_RATING: 2.74, HASTE_RATING: 3.53, EXPERTISE_RATING: 5.45, MANA_REGENERATION: 0.01, MAIN_HAND_DPS: 14.14 } },
    "rogue-combat": { unit: "attack power", weights: { STAMINA: 0.01, AGILITY: 1.96, STRENGTH: 1.1, CRIT_RATING: 1.7, HASTE_RATING: 1.72, HIT_RATING: 2.42, EXPERTISE_RATING: 2.55, SPELL_PENETRATION: 0.19, ATTACK_POWER: 1.0, MAIN_HAND_DPS: 10.57, OFF_HAND_DPS: 2.93 } },
    "rogue-assassination": { unit: "attack power", weights: { STAMINA: 0.01, AGILITY: 2.06, STRENGTH: 1.1, CRIT_RATING: 2.02, HASTE_RATING: 1.93, HIT_RATING: 2.8, EXPERTISE_RATING: 2.77, SPELL_PENETRATION: 0.65, ATTACK_POWER: 1.0, MAIN_HAND_DPS: 8.44, OFF_HAND_DPS: 4.16 } },
    "rogue-subtlety": { unit: "attack power", weights: { STAMINA: 0.01, AGILITY: 1.93, STRENGTH: 1.1, CRIT_RATING: 1.63, HASTE_RATING: 1.43, HIT_RATING: 2.12, EXPERTISE_RATING: 2.42, SPELL_PENETRATION: 0.16, ATTACK_POWER: 1.0, MAIN_HAND_DPS: 10.47, OFF_HAND_DPS: 2.27 } },
    "hunter-ranged": { unit: "attack power", weights: { AGILITY: 2.94, INTELLECT: 1.88, RANGED_ATTACK_POWER: 1.0, HIT_RATING: 3.71, CRIT_RATING: 2.56, HASTE_RATING: 2.21, MANA_REGENERATION: 1.21, RANGED_DPS: 9.68 } },
    "hunter-melee": { unit: "attack power", weights: { AGILITY: 2.7, STRENGTH: 1.11, INTELLECT: 1.89, ATTACK_POWER: 1.0, RANGED_ATTACK_POWER: 0.41, HIT_RATING: 6.7, CRIT_RATING: 2.7, HASTE_RATING: 2.46, MANA_REGENERATION: 0.62, MAIN_HAND_DPS: 13.14, OFF_HAND_DPS: 3.19, RANGED_DPS: 0.73 } },
    "shaman-enhancement": { unit: "attack power", weights: { STRENGTH: 2.2, AGILITY: 1.32, INTELLECT: 1.99, ATTACK_POWER: 1.0, HIT_RATING: 5.2, CRIT_RATING: 2.42, HASTE_RATING: 2.81, EXPERTISE_RATING: 3.5, SPELL_POWER: 1.27, SPELL_DAMAGE_DONE: 1.27, BONUS_STAT_NATURE_DAMAGE_DONE: 0.72, SPELL_PENETRATION: 2.52, MAIN_HAND_DPS: 14.18 } },
    "shaman-elemental": { unit: "spell power", weights: { INTELLECT: 0.19, SPIRIT: 0.02, SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, BONUS_STAT_FIRE_DAMAGE_DONE: 0.31, BONUS_STAT_NATURE_DAMAGE_DONE: 0.69, SPELL_PENETRATION: 1.81, HIT_RATING: 1.18, CRIT_RATING: 0.61, HASTE_RATING: 1.23, MANA_REGENERATION: 0.04 } },
    "priest-shadow": { unit: "spell power", weights: { INTELLECT: 0.26, SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, BONUS_STAT_SHADOW_DAMAGE_DONE: 1.0, SPELL_PENETRATION: 2.49, HIT_RATING: 1.2, CRIT_RATING: 0.99, MANA_REGENERATION: 0.01 } },
    "healer": { unit: "healing", weights: { SPELL_HEALING_DONE: 1.0, SPELL_POWER: 1.0, CRIT_RATING: 0.3, HASTE_RATING: 0.5, INTELLECT: 0.35, SPIRIT: 0.3, MANA_REGENERATION: 0.6 } },
    "priest-discipline": { unit: "healing", weights: { SPELL_HEALING_DONE: 1.0, SPELL_POWER: 1.0, CRIT_RATING: 0.7, HASTE_RATING: 0.15, INTELLECT: 0.2, SPIRIT: 0.15, MANA_REGENERATION: 0.4 } },
    "druid-balance": { unit: "spell power", weights: { INTELLECT: 0.23, SPIRIT: 0.02, SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, BONUS_STAT_ARCANE_DAMAGE_DONE: 0.62, BONUS_STAT_NATURE_DAMAGE_DONE: 0.38, HIT_RATING: 1.15, CRIT_RATING: 0.72, HASTE_RATING: 1.0, MANA_REGENERATION: 0.08 } },
    "mage-frost": { unit: "spell power", weights: { INTELLECT: 0.23, SPIRIT: 0.02, SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, HIT_RATING: 1.15, CRIT_RATING: 0.72, HASTE_RATING: 1.0, MANA_REGENERATION: 0.08, BONUS_STAT_FROST_DAMAGE_DONE: 1.0 } },
    "mage-fire": { unit: "spell power", weights: { INTELLECT: 0.23, SPIRIT: 0.02, SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, HIT_RATING: 1.15, CRIT_RATING: 0.72, HASTE_RATING: 1.0, MANA_REGENERATION: 0.08, BONUS_STAT_FIRE_DAMAGE_DONE: 1.0 } },
    "mage-arcane": { unit: "spell power", weights: { INTELLECT: 0.23, SPIRIT: 0.02, SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, HIT_RATING: 1.15, CRIT_RATING: 0.72, HASTE_RATING: 1.0, MANA_REGENERATION: 0.08, BONUS_STAT_ARCANE_DAMAGE_DONE: 1.0 } },
    "warlock-affliction": { unit: "spell power", weights: { INTELLECT: 0.23, SPIRIT: 0.02, SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, HIT_RATING: 1.15, CRIT_RATING: 0.72, HASTE_RATING: 1.0, MANA_REGENERATION: 0.08, BONUS_STAT_SHADOW_DAMAGE_DONE: 1.0, SPELL_PENETRATION: 1.81 } },
    "warlock-demonology": { unit: "spell power", weights: { INTELLECT: 0.23, SPIRIT: 0.02, SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, HIT_RATING: 1.15, CRIT_RATING: 0.72, HASTE_RATING: 1.0, MANA_REGENERATION: 0.08, BONUS_STAT_SHADOW_DAMAGE_DONE: 1.0, SPELL_PENETRATION: 1.81 } },
    "warlock-destruction": { unit: "spell power", weights: { INTELLECT: 0.23, SPIRIT: 0.02, SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, HIT_RATING: 1.15, CRIT_RATING: 0.72, HASTE_RATING: 1.0, MANA_REGENERATION: 0.08, BONUS_STAT_FIRE_DAMAGE_DONE: 0.5, BONUS_STAT_SHADOW_DAMAGE_DONE: 0.5, SPELL_PENETRATION: 1.81 } }
  },

  statLabels: {
    STRENGTH: "Strength", AGILITY: "Agility", STAMINA: "Stamina", INTELLECT: "Intellect", SPIRIT: "Spirit",
    ATTACK_POWER: "Attack power", FERAL_ATTACK_POWER: "Feral attack power", CRIT_RATING: "Crit",
    HIT_RATING: "Hit", SPELL_POWER: "Spell power", SPELL_DAMAGE_DONE: "Spell damage",
    SPELL_HEALING_DONE: "Healing", MANA_REGENERATION: "Mana per 5 sec", EXTRA_ARMOR: "Bonus armor",
    DODGE_RATING: "Dodge", PARRY_RATING: "Parry", DEFENSE_SKILL_RATING: "Defense", BLOCK_RATING: "Block",
    BLOCK_VALUE: "Block value", HASTE_RATING: "Haste", EXPERTISE_RATING: "Expertise", HEALTH_REGEN: "Health per 5 sec",
    SPELL_PENETRATION: "Spell penetration", FIRE_RESISTANCE: "Fire resistance", FROST_RESISTANCE: "Frost resistance",
    NATURE_RESISTANCE: "Nature resistance", SHADOW_RESISTANCE: "Shadow resistance", ARCANE_RESISTANCE: "Arcane resistance"
  },

  unknownIconId: 134400,

  qualityOrder: ["POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]
};
