window.GAME_RULES = {
  equipmentSlots: [
    { key: "HEAD", label: "Head", column: "left", itemSlots: ["HEAD"] },
    { key: "NECK", label: "Neck", column: "left", itemSlots: ["NECK"] },
    { key: "SHOULDER", label: "Shoulders", column: "left", itemSlots: ["SHOULDER"] },
    { key: "BACK", label: "Back", column: "left", itemSlots: ["CLOAK"] },
    { key: "CHEST", label: "Chest", column: "left", itemSlots: ["CHEST", "ROBE"] },
    { key: "WRIST", label: "Wrist", column: "left", itemSlots: ["WRIST"] },
    { key: "HANDS", label: "Hands", column: "right", itemSlots: ["HAND"] },
    { key: "WAIST", label: "Waist", column: "right", itemSlots: ["WAIST"] },
    { key: "LEGS", label: "Legs", column: "right", itemSlots: ["LEGS"] },
    { key: "FEET", label: "Feet", column: "right", itemSlots: ["FEET"] },
    { key: "FINGER_1", label: "Ring", column: "right", itemSlots: ["FINGER"], pairedWith: "FINGER_2" },
    { key: "FINGER_2", label: "Ring", column: "right", itemSlots: ["FINGER"], pairedWith: "FINGER_1" },
    { key: "TRINKET_1", label: "Trinket", column: "right", itemSlots: ["TRINKET"], pairedWith: "TRINKET_2" },
    { key: "TRINKET_2", label: "Trinket", column: "right", itemSlots: ["TRINKET"], pairedWith: "TRINKET_1" },
    { key: "MAIN_HAND", label: "Main hand", column: "bottom", itemSlots: ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"] },
    { key: "OFF_HAND", label: "Off hand", column: "bottom", itemSlots: ["WEAPONOFFHAND", "SHIELD", "HOLDABLE"] },
    { key: "RANGED", label: "Ranged / relic", column: "bottom", itemSlots: ["RANGED", "RANGEDRIGHT", "THROWN", "RELIC"] }
  ],

  classProficiencies: {
    "Druid": {
      armor: ["Cloth", "Leather", "Miscellaneous", "Idol"],
      weapons: ["Staff", "Mace", "Dagger", "Fist Weapon", "Polearm"],
      dualWield: false
    },
    "Warrior": {
      armor: ["Cloth", "Leather", "Mail", "Plate", "Shield", "Miscellaneous"],
      weapons: ["Axe", "Sword", "Mace", "Dagger", "Fist Weapon", "Polearm", "Staff", "Bow", "Gun", "Crossbow", "Thrown"],
      dualWield: true
    },
    "Paladin": {
      armor: ["Cloth", "Leather", "Mail", "Plate", "Shield", "Libram", "Miscellaneous"],
      weapons: ["Axe", "Sword", "Mace", "Polearm"],
      dualWield: false
    },
    "Hunter": {
      armor: ["Cloth", "Leather", "Mail", "Miscellaneous"],
      weapons: ["Axe", "Sword", "Dagger", "Fist Weapon", "Polearm", "Staff", "Bow", "Gun", "Crossbow", "Thrown"],
      dualWield: true
    },
    "Rogue": {
      armor: ["Cloth", "Leather", "Miscellaneous"],
      weapons: ["Dagger", "Sword", "Mace", "Fist Weapon", "Bow", "Gun", "Crossbow", "Thrown"],
      dualWield: true
    },
    "Priest": {
      armor: ["Cloth", "Miscellaneous"],
      weapons: ["Mace", "Dagger", "Staff", "Wand"],
      dualWield: false
    },
    "Shaman": {
      armor: ["Cloth", "Leather", "Mail", "Shield", "Totem", "Miscellaneous"],
      weapons: ["Axe", "Mace", "Dagger", "Fist Weapon", "Staff"],
      dualWield: false
    },
    "Mage": {
      armor: ["Cloth", "Miscellaneous"],
      weapons: ["Sword", "Dagger", "Staff", "Wand"],
      dualWield: false
    },
    "Warlock": {
      armor: ["Cloth", "Miscellaneous"],
      weapons: ["Sword", "Dagger", "Staff", "Wand"],
      dualWield: false
    }
  },

  defaultSpecsByClass: {
    "Druid": ["feral-cat", "druid-restoration"],
    "Warrior": ["melee-strength", "tank"],
    "Paladin": ["melee-strength", "healer"],
    "Hunter": ["melee-agility", "melee-agility"],
    "Rogue": ["melee-agility", "melee-agility"],
    "Priest": ["healer", "caster-damage"],
    "Shaman": ["caster-damage", "healer"],
    "Mage": ["caster-damage", "caster-damage"],
    "Warlock": ["caster-damage", "caster-damage"]
  },

  specPresets: {
    "feral-cat": {
      label: "Feral (cat)",
      weights: {
        STRENGTH: 1.0, AGILITY: 1.2, ATTACK_POWER: 0.5, FERAL_ATTACK_POWER: 0.5,
        CRIT_RATING: 1.0, HIT_RATING: 1.2, STAMINA: 0.3, EXTRA_ARMOR: 0.02, WEAPON_DPS: 0
      }
    },
    "feral-bear": {
      label: "Feral (bear)",
      weights: {
        STAMINA: 1.0, AGILITY: 0.9, STRENGTH: 0.5, EXTRA_ARMOR: 0.1, DODGE_RATING: 0.9,
        DEFENSE_SKILL_RATING: 0.7, FERAL_ATTACK_POWER: 0.2, ATTACK_POWER: 0.2, HIT_RATING: 0.5, WEAPON_DPS: 0
      }
    },
    "druid-restoration": {
      label: "Restoration",
      weights: {
        SPELL_HEALING_DONE: 1.0, SPELL_POWER: 1.0, INTELLECT: 0.5, SPIRIT: 0.45,
        MANA_REGENERATION: 2.0, STAMINA: 0.15
      }
    },
    "druid-balance": {
      label: "Balance",
      weights: {
        SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, INTELLECT: 0.4, CRIT_RATING: 0.6,
        HIT_RATING: 0.8, SPIRIT: 0.1, MANA_REGENERATION: 1.0, STAMINA: 0.15
      }
    },
    "melee-strength": {
      label: "Melee (strength)",
      weights: {
        STRENGTH: 1.0, AGILITY: 0.7, ATTACK_POWER: 0.5, CRIT_RATING: 1.0, HIT_RATING: 1.2,
        STAMINA: 0.3, WEAPON_DPS: 3.0
      }
    },
    "melee-agility": {
      label: "Melee / ranged (agility)",
      weights: {
        AGILITY: 1.0, STRENGTH: 0.5, ATTACK_POWER: 0.5, CRIT_RATING: 1.0, HIT_RATING: 1.2,
        STAMINA: 0.3, WEAPON_DPS: 3.0
      }
    },
    "tank": {
      label: "Tank",
      weights: {
        STAMINA: 1.0, DEFENSE_SKILL_RATING: 0.9, DODGE_RATING: 0.8, PARRY_RATING: 0.7,
        BLOCK_RATING: 0.5, BLOCK_VALUE: 0.3, STRENGTH: 0.5, AGILITY: 0.5, EXTRA_ARMOR: 0.1, WEAPON_DPS: 1.0
      }
    },
    "caster-damage": {
      label: "Caster damage",
      weights: {
        SPELL_POWER: 1.0, SPELL_DAMAGE_DONE: 1.0, INTELLECT: 0.4, CRIT_RATING: 0.6,
        HIT_RATING: 0.8, SPIRIT: 0.15, MANA_REGENERATION: 1.0, STAMINA: 0.15
      }
    },
    "healer": {
      label: "Healer",
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
    BLOCK_VALUE: "Block value", WEAPON_DPS: "Weapon DPS"
  },

  qualityOrder: ["POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]
};
