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
  enchantments?: string[];
  weapon?: WeaponStats;
  classes?: string[];
  faction?: string;
  sources?: ItemSource[];
  randomSuffixes?: RandomSuffix[];
  suffix?: RandomSuffix;
  vendorPrice?: number;
  icon?: number;
  iconName?: string;
  iconUrl?: string | null;
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
  raceName?: string;
  faction?: string;
  lastLogout?: number;
  render?: string | null;
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
  route?: SavedRoute;
  [field: string]: unknown;
}

export interface Settings {
  region: string;
  characters: Character[];
  selectedCharacterSlug: string | null;
  lookaheadLevels: number;
  [field: string]: unknown;
}

export interface SavedLeg {
  zone: string | null;
  toLevel: number;
  removedZones?: string[];
  dungeons?: boolean;
}

export interface SavedRoute {
  startLevel: number | null;
  legs: SavedLeg[];
  dungeons?: unknown;
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
  armorFromLevel?: Record<string, number>;
  oneHand: string[];
  twoHand: string[];
  ranged: string[];
  dualWield: boolean;
}

export interface SpecDefinition {
  label: string;
  preset: string;
  talentTree?: string;
  bestArmorOnly?: boolean;
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

export interface QuestieQuest {
  id: number;
  name: string;
  questLevel: number;
  requiredLevel: number;
  zone: string;
  faction: string | null;
  classes: number;
}

export interface QuestieItemDetail {
  sources: ItemSource[];
  quests: QuestieQuest[];
  vendorFaction: string | null;
}

export interface QuestieData {
  items: Record<string, QuestieItemDetail>;
  quests?: Record<string, QuestieQuest>;
  [field: string]: unknown;
}

export interface CraftSource extends ItemSource {
  type: "craft";
  profession: string;
  recipeId: number;
  reagents: { id: number; name: string; quantity: number }[];
}

export interface ReputationRequirement {
  factionId: number;
  tier: number;
  text?: string;
  side?: string | null;
}

export interface GuideDungeon {
  name: string;
  minLevel: number;
  areas: string[];
  questIds: number[];
}

export interface GuideZone {
  name: string;
  tier: string;
  minLevel: number;
  maxLevel: number;
  faction: string;
  note: string;
  dungeons?: { name: string }[];
}

export interface RouteLeg {
  zone: string | null;
  fromLevel: number;
  toLevel: number;
  dungeon?: boolean;
  removedZones?: string[];
}

export interface Candidate {
  item: Item;
  availableLevel: number;
  routeLeg: RouteLeg | null;
  gain: number;
}

export interface UpgradeOptions {
  slotDefinition: SlotDefinition;
  best: Candidate;
  quicker: Candidate | null;
  priority: number;
}

export interface PairedUpgradeOptions {
  group: true;
  slotDefinition: SlotDefinition;
  parts: UpgradeOptions[];
  priority: number;
}

export interface BlockList {
  names: Set<string>;
  questIds: Set<number>;
}

export interface ZoneGuide {
  credit: string;
  tierOrder: string[];
  zones: GuideZone[];
}
