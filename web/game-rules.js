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
    "druid-balance": { label: "Balance", preset: "caster-damage", talentTree: "Balance" },
    "warrior-arms": { label: "Arms", preset: "melee-strength", talentTree: "Arms" },
    "warrior-fury": { label: "Fury", preset: "melee-strength", talentTree: "Fury" },
    "warrior-protection": { label: "Protection", preset: "tank", talentTree: "Protection" },
    "paladin-retribution": { label: "Retribution", preset: "melee-strength", talentTree: "Retribution" },
    "paladin-protection": { label: "Protection", preset: "tank", talentTree: "Protection" },
    "paladin-holy": { label: "Holy", preset: "healer", talentTree: "Holy" },
    "hunter-beast-mastery": { label: "Beast Mastery", preset: "melee-agility", talentTree: "Beast Mastery" },
    "hunter-marksmanship": { label: "Marksmanship", preset: "melee-agility", talentTree: "Marksmanship" },
    "hunter-survival": { label: "Survival", preset: "melee-agility", talentTree: "Survival" },
    "rogue-combat": { label: "Combat", preset: "melee-agility", talentTree: "Combat" },
    "rogue-assassination": { label: "Assassination", preset: "melee-agility", talentTree: "Assassination" },
    "rogue-subtlety": { label: "Subtlety", preset: "melee-agility", talentTree: "Subtlety" },
    "priest-shadow": { label: "Shadow", preset: "caster-damage", talentTree: "Shadow" },
    "priest-holy": { label: "Holy", preset: "healer", talentTree: "Holy" },
    "priest-discipline": { label: "Discipline", preset: "healer", talentTree: "Discipline" },
    "shaman-enhancement": { label: "Enhancement", preset: "melee-strength", talentTree: "Enhancement" },
    "shaman-elemental": { label: "Elemental", preset: "caster-damage", talentTree: "Elemental" },
    "shaman-restoration": { label: "Restoration", preset: "healer", talentTree: "Restoration" },
    "mage-frost": { label: "Frost", preset: "caster-damage", talentTree: "Frost" },
    "mage-fire": { label: "Fire", preset: "caster-damage", talentTree: "Fire" },
    "mage-arcane": { label: "Arcane", preset: "caster-damage", talentTree: "Arcane" },
    "warlock-affliction": { label: "Affliction", preset: "caster-damage", talentTree: "Affliction" },
    "warlock-demonology": { label: "Demonology", preset: "caster-damage", talentTree: "Demonology" },
    "warlock-destruction": { label: "Destruction", preset: "caster-damage", talentTree: "Destruction" }
  },

  feralSpecs: { cat: "druid-feral-cat", bear: "druid-feral-bear" },

  playstyles: {
    "questing": { label: "Questing", multipliers: {}, pvpRulesetLabel: "Questing (PvP realm)", pvpRulesetMultipliers: { STAMINA: 2.5, EXTRA_ARMOR: 1.5 } },
    "dungeons": { label: "Dungeons", multipliers: { STAMINA: 0.6, HIT_RATING: 1.3, MANA_REGENERATION: 1.2 } }
  },

  pvpRuleset: "PvP",

  defaultPlaystyle: "questing",

  specPresets: {
    "feral-cat": {
      weights: {
        STRENGTH: 1.0, AGILITY: 1.2, ATTACK_POWER: 0.5, FERAL_ATTACK_POWER: 0.5,
        CRIT_RATING: 1.0, HIT_RATING: 1.2, STAMINA: 0.3, EXTRA_ARMOR: 0.02, WEAPON_DPS: 7.0
      }
    },
    "feral-bear": {
      weights: {
        STAMINA: 1.0, AGILITY: 0.9, STRENGTH: 0.5, EXTRA_ARMOR: 0.1, DODGE_RATING: 0.9,
        DEFENSE_SKILL_RATING: 0.7, FERAL_ATTACK_POWER: 0.2, ATTACK_POWER: 0.2, HIT_RATING: 0.5, WEAPON_DPS: 2.8
      }
    },
    "melee-strength": {
      weights: {
        STRENGTH: 1.0, AGILITY: 0.7, ATTACK_POWER: 0.5, CRIT_RATING: 1.0, HIT_RATING: 1.2,
        STAMINA: 0.3, WEAPON_DPS: 3.0
      }
    },
    "melee-agility": {
      weights: {
        AGILITY: 1.0, STRENGTH: 0.5, ATTACK_POWER: 0.5, CRIT_RATING: 1.0, HIT_RATING: 1.2,
        STAMINA: 0.3, WEAPON_DPS: 3.0
      }
    },
    "tank": {
      weights: {
        STAMINA: 1.0, DEFENSE_SKILL_RATING: 0.9, DODGE_RATING: 0.8, PARRY_RATING: 0.7,
        BLOCK_RATING: 0.5, BLOCK_VALUE: 0.3, STRENGTH: 0.5, AGILITY: 0.5, EXTRA_ARMOR: 0.1, WEAPON_DPS: 1.0
      }
    },
    "caster-damage": {
      weights: {
        SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, INTELLECT: 0.4, CRIT_RATING: 0.6,
        HIT_RATING: 0.8, SPIRIT: 0.15, MANA_REGENERATION: 1.0, STAMINA: 0.15
      }
    },
    "healer": {
      weights: {
        SPELL_HEALING_DONE: 1.0, SPELL_POWER: 1.0, INTELLECT: 0.5, SPIRIT: 0.4,
        MANA_REGENERATION: 2.0, STAMINA: 0.15
      }
    }
  },

  statLabels: {
    STRENGTH: "Strength", AGILITY: "Agility", STAMINA: "Stamina", INTELLECT: "Intellect", SPIRIT: "Spirit",
    ATTACK_POWER: "Attack power", FERAL_ATTACK_POWER: "Feral attack power", CRIT_RATING: "Crit",
    HIT_RATING: "Hit", SPELL_POWER: "Spell power", SPELL_DAMAGE_DONE: "Spell damage",
    SPELL_HEALING_DONE: "Healing", MANA_REGENERATION: "Mana per 5 sec", EXTRA_ARMOR: "Bonus armor",
    DODGE_RATING: "Dodge", PARRY_RATING: "Parry", DEFENSE_SKILL_RATING: "Defense", BLOCK_RATING: "Block",
    BLOCK_VALUE: "Block value", WEAPON_DPS: "Weapon DPS", HEALTH_REGEN: "Health per 5 sec",
    SPELL_PENETRATION: "Spell penetration", FIRE_RESISTANCE: "Fire resistance", FROST_RESISTANCE: "Frost resistance",
    NATURE_RESISTANCE: "Nature resistance", SHADOW_RESISTANCE: "Shadow resistance", ARCANE_RESISTANCE: "Arcane resistance"
  },

  unknownIconId: 134400,

  qualityOrder: ["POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]
};
