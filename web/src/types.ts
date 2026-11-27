export type Stats = Record<string, number>;
export type Weights = Record<string, number>;

export interface WeaponStats {
  minimumDamage?: number;
  maximumDamage?: number;
  speed?: number;
  damagePerSecond: number;
}

export interface RandomSuffix {
  bonusId: number;
  name: string;
  stats: Stats;
}

export interface ItemSource {
  type: string;
  zone?: string;
  questId?: number;
  quest?: string;
  level?: number;
  faction?: string;
  price?: number;
  count?: number;
  [field: string]: unknown;
}

export interface Item {
  id: number;
  name: string;
  quality: string;
  slot: string;
  itemClass?: string;
  itemSubclass: string;
  itemLevel?: number;
  requiredLevel?: number;
  usableLevel?: number;
  levelEstimated?: boolean;
  armor?: number;
  stats: Stats;
  effects: string[];
  weapon?: WeaponStats;
  classes?: string[];
  faction?: string;
  sources?: ItemSource[];
  randomSuffixes?: RandomSuffix[];
  suffix?: RandomSuffix;
  vendorPrice?: number;
  icon?: number;
  iconName?: string;
  fromSimulator?: boolean;
  reputation?: string;
  reputationRequirement?: { factionId: number; tier: number };
}

export type Equipment = Record<string, Item | undefined>;

export interface Snapshot {
  level: number;
  className: string;
  factionType: string;
  ruleset: string;
  equipment: Equipment;
  talentSpecs?: string[];
  completedQuestIds?: number[];
  professions: { name: string; recipeIds?: number[] }[];
  reputations: Record<string, number>;
  [field: string]: unknown;
}

export interface Character {
  slug: string;
  displayName: string;
  hiddenItemIds?: number[];
  skippedDungeons?: string[];
  playstyle?: string;
  gearFor?: string;
  feralForm?: string;
  maxGoldPerUpgrade?: number | null;
  [field: string]: unknown;
}

export interface SlotDefinition {
  key: string;
  label: string;
  column: string;
  itemSlots: string[];
  cosmetic?: boolean;
  pairedWith?: string;
  groupLabel?: string;
}

export interface Proficiencies {
  armor: string[];
  oneHand: string[];
  twoHand: string[];
  ranged: string[];
  dualWield: boolean;
}

export interface SpecDefinition {
  label: string;
  preset: string;
  talentTree?: string;
}

export interface Playstyle {
  label: string;
  multipliers: Weights;
  pvpRulesetLabel?: string;
  pvpRulesetStaminaShare?: number;
}

export interface GameRules {
  equipmentSlots: SlotDefinition[];
  classProficiencies: Record<string, Proficiencies>;
  classSpecs: Record<string, string[]>;
  specs: Record<string, SpecDefinition>;
  feralSpecs: { cat: string; bear: string };
  playstyles: Record<string, Playstyle>;
  defaultPlaystyle: string;
  pvpRuleset: string;
  specPresets: Record<string, { unit: string; weights: Weights }>;
  statLabels: Record<string, string>;
  unknownIconId: number;
}

export interface TalentSpecializations {
  specialization_groups?: {
    is_active?: boolean;
    specializations?: { specialization_name: string; spent_points: number }[];
  }[];
}
