// src/simulate.ts
// LaunchPath V0 simulation engine (pure function, no React deps)

export type GrowthModel =
  | { type: "linear"; initialUsers: number; monthlyIncrease: number }
  | { type: "rate"; initialUsers: number; monthlyGrowthRate: number }; // e.g. 0.15 = 15% MoM

export type FreePolicy = {
  freeUsesPerUserPerMonth: number; // unified free quota in "uses"
  appliesTo: "all_users"; // V0 fixed, reserved for future
};

export type UsageSegmentName = "free" | "light" | "heavy";

export type UsageSegment = {
  name: UsageSegmentName;
  ratio: number; // 0~1
  extraPaidUsesPerUserPerMonth: number; // paid uses beyond free quota
};

export type MonetizationModel =
  | { type: "per_use"; pricePerPaidUse: number }
  | {
      type: "subscription";
      pricePerUserPerMonth: number;
      penetrationRate: number; // 0~1
      includedUsesPerSubscriberPerMonth: number; // ✅ V1: subscription included uses
    }
  | { type: "lifetime"; oneTimePricePerUser: number }; // revenue only at month 1 (V0)

export type CostModel = {
  fixedCostPerMonth: number;
  costPerUse: number; // variable cost per use (applies to free + paid uses)
};

export type SimParams = {
  months: number; // default 12
  growth: GrowthModel;
  freePolicy: FreePolicy;
  segments: [UsageSegment, UsageSegment, UsageSegment];
  monetization: MonetizationModel;
  costs: CostModel;
};

export type MonthRow = {
  monthIndex: number; // 1..N
  users: number;

  totalUses: number;
  freeUses: number;
  includedUses: number; // ✅ subscription included usage
  paidUses: number;

  revenue: number;
  variableCost: number;
  fixedCost: number;
  totalCost: number;
  profit: number;

  cumulativeRevenue: number;
  cumulativeCost: number;
  cumulativeProfit: number;
};

export type RiskFlag = {
  code:
    | "INVALID_INPUT"
    | "RATIO_NOT_100"
    | "NEGATIVE_PROFIT_ALL_YEAR"
    | "BREAK_EVEN_NOT_REACHED"
    | "FREE_COST_DOMINANT"
    | "PRICE_TOO_LOW_VS_COST"
    | "SUB_PENETRATION_ZERO";
  severity: "info" | "warning" | "critical";
  message: string;
};

export type SimResult = {
  paramsEcho: SimParams;
  rows: MonthRow[];
  summary: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    breakEvenMonth: number | null;
    avgRevenuePerUserPerMonth: number;
    avgCostPerUserPerMonth: number;
  };
  risks: RiskFlag[];
};

/** Helpers */
function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function roundCount(n: number): number {
  return Math.round(n);
}

function safeNonNeg(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

function dedupeRisks(risks: RiskFlag[]): RiskFlag[] {
  const seen = new Set<string>();
  const out: RiskFlag[] = [];
  for (const r of risks) {
    const key = `${r.code}::${r.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  const order: Record<RiskFlag["severity"], number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  out.sort((a, b) => order[a.severity] - order[b.severity]);
  return out;
}

/**
 * simulate
 * - Pure deterministic computation
 * - Uses "users" as MAU (monthly active users)
 */
export function simulate(params: SimParams): SimResult {
  const risks: RiskFlag[] = [];

  const months = Math.max(1, Math.min(120, roundCount(safeNonNeg(params.months || 12) || 12)));

  const fixedCostPerMonth = safeNonNeg(params.costs?.fixedCostPerMonth ?? 0);
  const costPerUse = safeNonNeg(params.costs?.costPerUse ?? 0);

  const freeUsesPerUser = safeNonNeg(params.freePolicy?.freeUsesPerUserPerMonth ?? 0);

  const segments = params.segments;
  const segs: UsageSegment[] = [
    {
      name: segments?.[0]?.name ?? "free",
      ratio: Number.isFinite(segments?.[0]?.ratio) ? segments[0].ratio : 0,
      extraPaidUsesPerUserPerMonth: safeNonNeg(segments?.[0]?.extraPaidUsesPerUserPerMonth ?? 0),
    },
    {
      name: segments?.[1]?.name ?? "light",
      ratio: Number.isFinite(segments?.[1]?.ratio) ? segments[1].ratio : 0,
      extraPaidUsesPerUserPerMonth: safeNonNeg(segments?.[1]?.extraPaidUsesPerUserPerMonth ?? 0),
    },
    {
      name: segments?.[2]?.name ?? "heavy",
      ratio: Number.isFinite(segments?.[2]?.ratio) ? segments[2].ratio : 0,
      extraPaidUsesPerUserPerMonth: safeNonNeg(segments?.[2]?.extraPaidUsesPerUserPerMonth ?? 0),
    },
  ];

  const ratioSum = segs.reduce((acc, s) => acc + (Number.isFinite(s.ratio) ? s.ratio : 0), 0);

  if (!Number.isFinite(ratioSum) || ratioSum <= 0) {
    risks.push({
      code: "INVALID_INPUT",
      severity: "critical",
      message: "User segment ratios are invalid (sum <= 0). Using default split 50/30/20.",
    });
    segs[0].ratio = 0.5;
    segs[1].ratio = 0.3;
    segs[2].ratio = 0.2;
  } else if (!approxEqual(ratioSum, 1, 1e-3)) {
    risks.push({
      code: "RATIO_NOT_100",
      severity: "warning",
      message: `User segment ratios sum to ${(ratioSum * 100).toFixed(1)}%, not 100%. Auto-normalized.`,
    });
    for (const s of segs) s.ratio = s.ratio / ratioSum;
  }

  const growth = params.growth;
  let growthInitialUsers = 0;
  let monthlyIncrease = 0;
  let monthlyGrowthRate = 0;

  if (!growth || (growth.type !== "linear" && growth.type !== "rate")) {
    risks.push({
      code: "INVALID_INPUT",
      severity: "critical",
      message: "Growth model is missing/invalid. Using linear: initialUsers=100, monthlyIncrease=0.",
    });
    growthInitialUsers = 100;
    monthlyIncrease = 0;
    monthlyGrowthRate = 0;    
  } else if (growth.type === "linear") {
    growthInitialUsers = roundCount(safeNonNeg(growth.initialUsers));
    monthlyIncrease = roundCount(safeNonNeg(growth.monthlyIncrease));
    monthlyGrowthRate = 0; // not used in linear mode
  } else {
    growthInitialUsers = roundCount(safeNonNeg(growth.initialUsers));
    monthlyGrowthRate = clampNumber(growth.monthlyGrowthRate, 0, 10);
    monthlyIncrease = 0; // not used in rate mode
  }

  const monetization = params.monetization;
  if (!monetization) {
    risks.push({
      code: "INVALID_INPUT",
      severity: "critical",
      message: "Monetization model missing. Assuming per-use price = 1.0.",
    });
  }

  const rows: MonthRow[] = [];

  let cumulativeRevenue = 0;
  let cumulativeCost = 0;
  let cumulativeProfit = 0;

  let totalFreeVariableCost = 0;
  let totalVariableCost = 0;

  for (let m = 1; m <= months; m++) {
    let usersRaw = 0;
    if (!growth || (growth.type !== "linear" && growth.type !== "rate")) {
      usersRaw = 100;
    } else if (growth.type === "linear") {
      usersRaw = growthInitialUsers + (m - 1) * monthlyIncrease;
    } else {
      usersRaw = growthInitialUsers * Math.pow(1 + monthlyGrowthRate, m - 1);
    }
    const users = Math.max(0, roundCount(usersRaw));

    // --- uses ---
    let freeUses = 0;
    let includedUses = 0;
    let paidUses = 0;

    // Get monetization for this simulation
    const mon = monetization ?? ({ type: "per_use", pricePerPaidUse: 1.0 } as MonetizationModel);

    // Free uses always apply to all users (monthly reset)
    freeUses = roundCount(Math.max(0, users * freeUsesPerUser));

    if (mon.type === "subscription") {
      const pen = clampNumber(mon.penetrationRate ?? 0, 0, 1);
      const subscriberUsers = roundCount(users * pen);

      const includedPerSub = safeNonNeg(mon.includedUsesPerSubscriberPerMonth ?? 0);
      includedUses = roundCount(Math.max(0, subscriberUsers * includedPerSub));

      // Subscription revenue is not tied to paid-uses in V1
      paidUses = 0;
    } else {
      // per_use / lifetime: paid uses come from segments
      let paidRaw = 0;
      for (const s of segs) {
        const segUsers = users * s.ratio;
        paidRaw += segUsers * s.extraPaidUsesPerUserPerMonth;
      }
      paidUses = roundCount(Math.max(0, paidRaw));
    }

    const totalUses = freeUses + includedUses + paidUses;


    let revenue = 0;
    
    if (mon.type === "per_use") {
      const price = safeNonNeg(mon.pricePerPaidUse);
      if (price <= costPerUse && costPerUse > 0) {
        risks.push({
          code: "PRICE_TOO_LOW_VS_COST",
          severity: "critical",
          message: `Per-use price (${price}) is <= cost per use (${costPerUse}). You may lose money even on paid usage.`,
        });
      }
      revenue = paidUses * price;
    } else if (mon.type === "subscription") {
      const price = safeNonNeg(mon.pricePerUserPerMonth);
      const pen = clampNumber(mon.penetrationRate ?? 0, 0, 1);
      if (pen === 0) {
        risks.push({
          code: "SUB_PENETRATION_ZERO",
          severity: "warning",
          message: "Subscription penetration rate is 0%. Subscription revenue will be $0.",
        });
      }
      const payingSubs = roundCount(users * pen);
      revenue = payingSubs * price;
    } else if (mon.type === "lifetime") {
      const oneTime = safeNonNeg(mon.oneTimePricePerUser);
      revenue = m === 1 ? users * oneTime : 0;
    } else {
      revenue = 0;
    }

    const variableCost = totalUses * costPerUse;
    const freeVariableCost = freeUses * costPerUse;

    const totalCost = fixedCostPerMonth + variableCost;
    const profit = revenue - totalCost;

    cumulativeRevenue += revenue;
    cumulativeCost += totalCost;
    cumulativeProfit += profit;

    totalFreeVariableCost += freeVariableCost;
    totalVariableCost += variableCost;

    rows.push({
      monthIndex: m,
      users,

      totalUses,
      freeUses,
      includedUses,
      paidUses,

      revenue: roundMoney(revenue),
      variableCost: roundMoney(variableCost),
      fixedCost: roundMoney(fixedCostPerMonth),
      totalCost: roundMoney(totalCost),
      profit: roundMoney(profit),

      cumulativeRevenue: roundMoney(cumulativeRevenue),
      cumulativeCost: roundMoney(cumulativeCost),
      cumulativeProfit: roundMoney(cumulativeProfit),
    });
  }

  const totalRevenue = rows.length ? rows[rows.length - 1].cumulativeRevenue : 0;
  const totalCost = rows.length ? rows[rows.length - 1].cumulativeCost : 0;
  const totalProfit = rows.length ? rows[rows.length - 1].cumulativeProfit : 0;

  let breakEvenMonth: number | null = null;
  for (const r of rows) {
    if (r.cumulativeProfit >= 0) {
      breakEvenMonth = r.monthIndex;
      break;
    }
  }

  const totalUsersAcrossMonths = rows.reduce((acc, r) => acc + r.users, 0);
  const avgUsers = rows.length ? totalUsersAcrossMonths / rows.length : 0;

  const avgRevenuePerUserPerMonth = avgUsers > 0 ? totalRevenue / (avgUsers * rows.length) : 0;
  const avgCostPerUserPerMonth = avgUsers > 0 ? totalCost / (avgUsers * rows.length) : 0;

  const allMonthsNegative = rows.every((r) => r.profit < 0);
  if (allMonthsNegative) {
    risks.push({
      code: "NEGATIVE_PROFIT_ALL_YEAR",
      severity: "critical",
      message: `Profit is negative in every month (${months} months).`,
    });
  }

  if (breakEvenMonth === null) {
    risks.push({
      code: "BREAK_EVEN_NOT_REACHED",
      severity: "warning",
      message: `Break-even not reached within ${months} months.`,
    });
  }

  // const totalFixedCost = fixedCostPerMonth * months;
  // const grandTotalCostRaw = totalFixedCost + totalVariableCost;
  const freeCostShare = totalVariableCost  > 0 ? totalFreeVariableCost / totalVariableCost  : 0;

  if (freeCostShare > 0.5) {
    risks.push({
      code: "FREE_COST_DOMINANT",
      severity: "warning",
      message: `Free usage drives ${(freeCostShare * 100).toFixed(0)}% of total cost. Consider lowering free quota or cost per use.`,
    });
  }

  return {
    paramsEcho: {
      ...params,
      months,
      costs: { fixedCostPerMonth, costPerUse },
      freePolicy: { ...params.freePolicy, freeUsesPerUserPerMonth: freeUsesPerUser },
      segments: [segs[0], segs[1], segs[2]],
    },
    rows,
    summary: {
      totalRevenue: roundMoney(totalRevenue),
      totalCost: roundMoney(totalCost),
      totalProfit: roundMoney(totalProfit),
      breakEvenMonth,
      avgRevenuePerUserPerMonth: roundMoney(avgRevenuePerUserPerMonth),
      avgCostPerUserPerMonth: roundMoney(avgCostPerUserPerMonth),
    },
    risks: dedupeRisks(risks),
  };
}

/** Optional: sensible defaults for quick start */
export const defaultParams: SimParams = {
  months: 12,
  growth: { type: "rate", initialUsers: 100, monthlyGrowthRate: 0.15 },
  freePolicy: { freeUsesPerUserPerMonth: 3, appliesTo: "all_users" },
  segments: [
    { name: "free", ratio: 0.5, extraPaidUsesPerUserPerMonth: 0 },
    { name: "light", ratio: 0.3, extraPaidUsesPerUserPerMonth: 5 },
    { name: "heavy", ratio: 0.2, extraPaidUsesPerUserPerMonth: 20 },
  ],
  monetization: { type: "per_use", pricePerPaidUse: 1.0 },
  costs: { fixedCostPerMonth: 300, costPerUse: 0.05 },
};
