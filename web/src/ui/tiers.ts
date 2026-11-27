export const TIER_COLORS: Record<string, string> = { S: "tier-orange", A: "tier-yellow", B: "tier-green", C: "tier-grey", D: "tier-grey" };

export function tierColor(tier: string): string {
  return TIER_COLORS[tier] || TIER_COLORS.C;
}
