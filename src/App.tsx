// 2026-Feb-04
// TODO: revisit number input constraints after user feedback

import { useMemo, useState, useEffect } from "react";
import { simulate, defaultParams, type SimParams, type SimResult } from "./simulate";
import { useNumberInput } from "./useNumberInput";
import { RevenueCostChart } from "./charts/RevenueCostChart"
import { ProfitChart } from "./charts/ProfitChart"

function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default function App() {
  // -----------------------------
  // Core horizon
  // -----------------------------
  const months = useNumberInput(defaultParams.months, { min: 1 });

  // -----------------------------
  // Costs
  // -----------------------------
  const fixedCost = useNumberInput(defaultParams.costs.fixedCostPerMonth, { min: 0 });
  const costPerUse = useNumberInput(defaultParams.costs.costPerUse, { min: 0 });

  // -----------------------------
  // Free policy
  // -----------------------------
  const freeUses = useNumberInput(defaultParams.freePolicy.freeUsesPerUserPerMonth, { min: 0 });

  // -----------------------------
  // Growth model (UI select)
  // -----------------------------
  const [growthType, setGrowthType] = useState<"linear" | "rate">(
    defaultParams.growth.type === "linear" ? "linear" : "rate"
  );

  const initialUsers = useNumberInput(defaultParams.growth.initialUsers,
    { min: 0 }
  );

  const monthlyIncrease = useNumberInput(
    defaultParams.growth.type === "linear" ? defaultParams.growth.monthlyIncrease : 0,
    { min: 0 }
  );

  const [paidUsageModel, setPaidUsageModel] = useState<"simple" | "detailed">(
    "simple"
  );

  // 用百分比输入更直观：15 表示 15%
  const monthlyGrowthRatePct = useNumberInput(
    defaultParams.growth.type === "rate" ? defaultParams.growth.monthlyGrowthRate * 100 : 15,
    { min: 0 }
  );

  // simple user segments //
  const payingUserRatioPct = useNumberInput(30, { min: 0, max: 100 }); // 默认 30%
  const paidUsesPerPayingUser = useNumberInput(10, { min: 0 });        // 默认每付费用户10次/月

  // -----------------------------
  // Segments (ratios + paid uses)
  // -----------------------------
  const seg0Ratio = useNumberInput(defaultParams.segments[0].ratio * 100, { min: 0 });
  const seg1Ratio = useNumberInput(defaultParams.segments[1].ratio * 100, { min: 0 });
  const seg2Ratio = useNumberInput(defaultParams.segments[2].ratio * 100, { min: 0 });

  const seg0Paid = useNumberInput(defaultParams.segments[0].extraPaidUsesPerUserPerMonth, { min: 0 });
  const seg1Paid = useNumberInput(defaultParams.segments[1].extraPaidUsesPerUserPerMonth, { min: 0 });
  const seg2Paid = useNumberInput(defaultParams.segments[2].extraPaidUsesPerUserPerMonth, { min: 0 });

  // -----------------------------
  // Monetization
  // -----------------------------
  const [monetizationType, setMonetizationType] = useState<"per_use" | "subscription">(
    "per_use"
  );

  const pricePerPaidUse = useNumberInput(
    defaultParams.monetization.type === "per_use" ? defaultParams.monetization.pricePerPaidUse : 1,
    { min: 0 }
  );

  // --- Subscription (V1) ---
  const subPricePerUserPerMonth = useNumberInput(20, { min: 0 }); // 默认 $20/月
  const subPenetrationPct = useNumberInput(10, { min: 0, max: 100 }); // 默认 10%
  const subIncludedUses = useNumberInput(20, { min: 0 }); // 默认包含 20 uses/月（订阅用户）
  
  // -----------------------------
  // Build params from UI inputs (so report assumptions match UI)
  // -----------------------------
  const params: SimParams = useMemo(() => {
    const growth =
      growthType === "linear"
        ? ({ type: "linear", 
            initialUsers: initialUsers.number,
            monthlyIncrease: monthlyIncrease.number,
          } as const)
        : ({
            type: "rate",
            initialUsers: initialUsers.number,
            monthlyGrowthRate: monthlyGrowthRatePct.number / 100,
          } as const);

    const segments: [SimParams["segments"][0], SimParams["segments"][1], SimParams["segments"][2]] =
        paidUsageModel === "simple"
        ? ([
            // 保持 3 段，避免 simulate.ts 的 paramsEcho 取 segs[2] 报错
            {
              ...defaultParams.segments[0],
              ratio: Math.max(0, Math.min(1, 1 - payingUserRatioPct.number / 100)),
              extraPaidUsesPerUserPerMonth: 0,
            },
            {
              ...defaultParams.segments[1],
              ratio: Math.max(0, Math.min(1, payingUserRatioPct.number / 100)),
              extraPaidUsesPerUserPerMonth: paidUsesPerPayingUser.number,
            },
            {
              ...defaultParams.segments[2],
              ratio: 0,
              extraPaidUsesPerUserPerMonth: 0,
            },
          ] as const)
        : ([
            {
              ...defaultParams.segments[0],
              ratio: seg0Ratio.number / 100,
              extraPaidUsesPerUserPerMonth: seg0Paid.number,
            },
            {
              ...defaultParams.segments[1],
              ratio: seg1Ratio.number / 100,
              extraPaidUsesPerUserPerMonth: seg1Paid.number,
            },
            {
              ...defaultParams.segments[2],
              ratio: seg2Ratio.number / 100,
              extraPaidUsesPerUserPerMonth: seg2Paid.number,
            },
          ] as const);
          

    return {
      ...defaultParams,
      months: Math.round(months.number),

      growth,

      freePolicy: {
        ...defaultParams.freePolicy,
        freeUsesPerUserPerMonth: freeUses.number,
      },

      segments,

      monetization:
        monetizationType === "per_use"
          ? ({
              type: "per_use",
              pricePerPaidUse: pricePerPaidUse.number,
            } as const)
          : ({
              type: "subscription",
              pricePerUserPerMonth: subPricePerUserPerMonth.number,
              penetrationRate: subPenetrationPct.number / 100,
              includedUsesPerSubscriberPerMonth: subIncludedUses.number,
            } as const),

      costs: {
        ...defaultParams.costs,
        fixedCostPerMonth: fixedCost.number,
        costPerUse: costPerUse.number,
      },
    };
  }, [
    paidUsageModel,
    payingUserRatioPct.number,
    paidUsesPerPayingUser.number,

    monetizationType,
    subPricePerUserPerMonth.number,
    subPenetrationPct.number,
    subIncludedUses.number,

    growthType,
    months.number,
    monthlyIncrease.number,
    initialUsers.number,
    monthlyGrowthRatePct.number,
    freeUses.number,
    seg0Ratio.number,
    seg1Ratio.number,
    seg2Ratio.number,
    seg0Paid.number,
    seg1Paid.number,
    seg2Paid.number,
    pricePerPaidUse.number,
    fixedCost.number,
    costPerUse.number,
  ]);

  // const result = simulate(params);
  const [result, setResult] = useState<SimResult | null>(null);

  const LAST_STEP = 4;
  
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (step < LAST_STEP) {
      setResult(null);
    }
  }, [step]);

  const runSimulation = () => {
    const r = simulate(params);
    setResult(r);
  };


  // -----------------------------
  // Explainability breakdown
  // -----------------------------
  let totalUses = 0;
  let totalFreeUses = 0;
  let totalPaidUses = 0;
  let totalIncludedUses = 0;
  if (result) {
    totalUses = result.rows.reduce((acc, r) => acc + r.totalUses, 0);
    totalFreeUses = result.rows.reduce((acc, r) => acc + r.freeUses, 0);
    totalPaidUses = result.rows.reduce((acc, r) => acc + r.paidUses, 0);
    totalIncludedUses = result.rows.reduce((acc, r) => acc + r.includedUses, 0);
  }

  //全年活跃用户总量
  let totalUserMonths = 0;
  if (result) {
    totalUserMonths = result.rows.reduce((acc, r) => acc + r.users, 0); 
  }

  const fixedCostTotal = fixedCost.number * Math.round(months.number);
  
  let variableCostTotal = 0;
  if (result) {
    variableCostTotal = result.summary.totalCost - fixedCostTotal;
  }

  const freeUsageCost = totalFreeUses * costPerUse.number;
  const freeCostShare = variableCostTotal > 0 ? freeUsageCost / variableCostTotal : 0;

  const includedUsageCost = totalIncludedUses * costPerUse.number;

  // Avg revenue per active user / month
  let avgRevenuePerUserMonth = 0;
  if (result) {
   avgRevenuePerUserMonth = totalUserMonths > 0 ? result.summary.totalRevenue / totalUserMonths : 0;
  }

  // Avg variable cost per active user / month
  const avgVariableCostPerUserMonth = totalUserMonths > 0 ? variableCostTotal / totalUserMonths : 0;

  // Contribution margin per active user / month
  const contributionPerUserMonth = avgRevenuePerUserMonth - avgVariableCostPerUserMonth;

  // Break-even MAU threshold
  const breakEvenMAU = contributionPerUserMonth > 0 ? fixedCost.number / contributionPerUserMonth : Infinity;


  // UI helper
  const sectionStyle: React.CSSProperties = { padding: 12, border: "1px solid #ddd", borderRadius: 10, marginBottom: 12 };
  const labelStyle: React.CSSProperties = { display: "block", marginBottom: 10 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: 8, marginTop: 6 };

  const isZeroVariableCost = costPerUse.number === 0;
  // const isSubscription = monetizationType === "subscription";

  // const includedUsesPerSub = isSubscription ? subIncludedUses.number : 0;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
    <h1>LaunchPath</h1>
    <p style={{ color: "#666", fontSize: 15, marginTop: 6, marginBottom: 20 }}>
      Estimate revenue, cost, and break-even under simple assumptions.
    </p>


      {/* ---------------- Inputs ---------------- */}
      <div style={{ minHeight: 420 }}>
        {step === 1 && (
          <div style={sectionStyle}>
            <h3>Monetization</h3>

            <label style={labelStyle}>
              Revenue structure
              <select
                value={monetizationType}
                onChange={(e) => setMonetizationType(e.target.value as "per_use" | "subscription")}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              >
                <option value="per_use">Per paid use</option>
                <option value="subscription">Subscription (monthly)</option>
              </select>
            </label>

            <p style={{ color: "#666", fontSize: 12 }}>
              Choose how your product makes money. This determines later inputs.
            </p>
          </div>
        )}

        { step === 2 && (
          <>
            <div style={sectionStyle}>
              <h3>Simulation</h3>
              <label style={labelStyle}>
                Months
                <input {...months.inputProps} style={inputStyle} />
              </label>
            </div>
          
            <div style={sectionStyle}>
              <h3>Growth</h3>
              <label style={labelStyle}>
                Growth type
                <select
                  value={growthType}
                  onChange={(e) => setGrowthType(e.target.value as "linear" | "rate")}
                  style={{ width: "100%", padding: 8, marginTop: 6 }}
                >
                  <option value="linear">Linear growth (initial + monthly increase)</option>
                  <option value="rate">Monthly growth rate%</option>
                </select>
              </label>

              {growthType === "linear" ? (
                <>
                <label style={labelStyle}>
                  Initial active users (MAU, month 1)
                  <input {...initialUsers.inputProps} style={inputStyle} />
                </label>

                <label style={labelStyle}>
                  Net MAU increase per month
                  <input {...monthlyIncrease.inputProps} style={inputStyle} />
                  <p style={{ margin: "4px 0 0", color: "#666", fontSize: 12 }}>
                    Set to 0 for a stable user base (same MAU every month).
                  </p>
                </label>
              </>

              ) : (
                <>
                  <label style={labelStyle}>
                    Initial active users (MAU, month 1)
                    <input {...initialUsers.inputProps} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    Monthly growth rate (%)
                    <input {...monthlyGrowthRatePct.inputProps} style={inputStyle} />
                  </label>
                </>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={sectionStyle}>
              <h3>Usage policy</h3>
              <label style={labelStyle}>
                Free uses per user per month
                <input {...freeUses.inputProps} style={inputStyle} />
              </label>
            </div>

            <div style={sectionStyle}>
              <h3>Costs</h3>
              <label style={labelStyle}>
                Fixed cost per month ($)
                <input {...fixedCost.inputProps} style={inputStyle} />
              </label>

              <label style={labelStyle}>
                Cost per use ($)
                <input {...costPerUse.inputProps} style={inputStyle} />
              </label>
            </div>
          </>
        )}

        {step === 4 && monetizationType !== "subscription" && (
          <>
          <div style={sectionStyle}>
            <h3>Per-use pricing</h3>
          
            <label style={labelStyle}>
              Price per paid use ($)
              <input {...pricePerPaidUse.inputProps} style={inputStyle} />
            </label>
            <p style={{ margin: 0, color: "#555" }}>
              Revenue is tied to paid uses.
            </p>
          </div>

          <div style={sectionStyle}>
            <h3>User segments</h3>
            <label style={labelStyle}>
              Paid usage model
              <select
                value={paidUsageModel}
                onChange={(e) => setPaidUsageModel(e.target.value as "simple" | "detailed")}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              >
                <option value="simple">Simple (recommended)</option>
                <option value="detailed">Detailed (segments)</option>
              </select>
            </label>

            {paidUsageModel === "simple" ? (
            <>
              <p style={{ marginTop: 0, color: "#555" }}>
                Simple model: paid uses are derived from (paying user ratio × paid uses per paying user).
                This will be mapped to segments under the hood.
              </p>

              <label style={labelStyle}>
                Paying user ratio (%)
                <input {...payingUserRatioPct.inputProps} style={inputStyle} />
              </label>

              <label style={labelStyle}>
                Paid uses per paying user / month
                <input {...paidUsesPerPayingUser.inputProps} style={inputStyle} />
              </label>
            </>
          ) : (
            <>
              <p style={{ marginTop: 0, color: "#555" }}>
                Ratios don&apos;t have to sum to 100% — the engine will auto-normalize and warn, but try to keep them close.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <strong>{params.segments[0].name}</strong>
                  <label style={labelStyle}>
                    Ratio (%)
                    <input {...seg0Ratio.inputProps} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    Extra paid uses / user / month
                    <input {...seg0Paid.inputProps} style={inputStyle} />
                  </label>
                </div>

                <div>
                  <strong>{params.segments[1].name}</strong>
                  <label style={labelStyle}>
                    Ratio (%)
                    <input {...seg1Ratio.inputProps} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    Extra paid uses / user / month
                    <input {...seg1Paid.inputProps} style={inputStyle} />
                  </label>
                </div>

                <div>
                  <strong>{params.segments[2].name}</strong>
                  <label style={labelStyle}>
                    Ratio (%)
                    <input {...seg2Ratio.inputProps} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    Extra paid uses / user / month
                    <input {...seg2Paid.inputProps} style={inputStyle} />
                  </label>
                </div>
              </div>
            </>
          )}        
          </div>
          </>
        )}

        {step === 4 && monetizationType === "subscription" && (
          <div style={sectionStyle}>
          <h3>Subscription pricing</h3>

          <label style={labelStyle}>
            Subscription price per user / month ($)
            <input {...subPricePerUserPerMonth.inputProps} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Subscription penetration (% of MAU)
            <input {...subPenetrationPct.inputProps} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Included uses per subscriber / month
            <input {...subIncludedUses.inputProps} style={inputStyle} />
            <p style={{ margin: "4px 0 0", color: "#666", fontSize: 12 }}>
              V1 assumption: subscribers also receive monthly free uses (free + included).
            </p>
          </label>

          <p style={{ margin: 0, color: "#555" }}>
            Revenue is tied to subscribers, not usage. Usage only affects cost.
          </p>

          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          {step > 1 && (
            <button onClick={() => setStep(step - 1)}>Back</button>
          )}

          {step < LAST_STEP ? (
            <button onClick={() => setStep(step + 1)}>Next</button>
          ) : (
            <button onClick={runSimulation}>Run simulation</button>
          )}
        </div>        

      </div>

      {/* ---------------- Result ---------------- */}
      <hr />

      <h2>Result</h2>
      
      {result && (
        <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          <strong>Modeling notes:</strong>
          <ul style={{ margin: "6px 0 0 16px" }}>
            <li>Free uses are calculated per active user (MAU) per month.</li>

            {params.monetization.type === "subscription" && (
              <li>Included usage is treated as fully utilized by subscribers.</li>
            )}

            <li>Break-even is the first month where cumulative profit ≥ 0.</li>
          </ul>
        </div>
      )}

      {result && (
        <div style={{ minWidth: 0, minHeight: 0 }}>
        <p>
          <strong>Revenue (total):</strong> {result.summary.totalRevenue}
        </p>

        <h3>Cost breakdown</h3>
        <ul>
          <li>
            Fixed cost ({Math.round(months.number)} months): <strong>{money(fixedCostTotal)}</strong>
          </li>

          <li>
            Usage summary:{" "}
            <span style={{ color: "#666" }}>
              total uses {totalUses} (free {totalFreeUses}, included {totalIncludedUses}, paid {totalPaidUses})
            </span>
          </li>

          <li>
            Free usage cost: <strong>{money(freeUsageCost)}</strong>{" "}
            <span style={{ color: "#666" }}>
              ({Math.round(freeCostShare * 100)}% of variable cost)
            </span>
            {freeCostShare >= 0.5 ? (
              <span> ⚠️ Free policy is the dominant driver of variable cost.</span>
            ) : (
              <span> ✅ Free policy is not the main cost driver.</span>
            )}
          </li>

          <li>
              Included usage cost: <strong>{money(includedUsageCost)}</strong>{" "}
              <span style={{ color: "#666" }}>
                (= {totalIncludedUses} × {costPerUse.number})
              </span>
          </li>       

          <li>
            Variable cost (usage): <strong>{money(variableCostTotal)}</strong>{" "}
            <span style={{ color: "#666" }}>
              (= {totalUses} × {costPerUse.number})
            </span>
          </li>

          <li>
            Total cost: <strong>{result.summary.totalCost}</strong>
          </li>
        </ul>
        
        <h3>Unit economics</h3>
          <ul>
            <li>
              Avg revenue per active user / month:{" "}
              <strong>{money(avgRevenuePerUserMonth)}</strong>
            </li>
            <li>
              Avg variable cost per active user / month:{" "}
              <strong>{money(avgVariableCostPerUserMonth)}</strong>
            </li>
            <li>
              Contribution margin:{" "}
              <strong>{money(contributionPerUserMonth)}</strong> per active user / month
            </li>
            <li>
              Break-even MAU (monthly):{" "}
              <strong>
                {Number.isFinite(breakEvenMAU)
                  ? Math.ceil(breakEvenMAU)
                  : "Not reachable"}
              </strong>
            </li>
          </ul> 

        {isZeroVariableCost && (
          <p style={{ marginTop: 8, color: "#a66", fontSize: 13 }}>
            ⚠️ Note: Variable cost per use is set to $0. This scenario assumes unlimited
            usage capacity with no marginal cost. Results may change significantly if
            usage cost becomes non-zero.
          </p>
        )}

        <p>
          <strong>Total profit:</strong> {result.summary.totalProfit}
        </p>

        {result.summary.breakEvenMonth ? (
          <p>
            Break-even reached in month <strong>{result.summary.breakEvenMonth}</strong>.
          </p>
        ) : (
          <p>Break-even not reached within the simulated period.</p>
        )}

        {result.rows && result.rows.length > 0 && (
          <div style={{ minWidth: 0, minHeight: 0 }}>
            <h3>Monthly Revenue vs Monthly Cost</h3>
            <RevenueCostChart rows={result.rows} />
            <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              Revenue (green) & Total Cost (pink)
            </p>

            <h3>Profit Over Time</h3>
            <ProfitChart rows={result.rows} />
            <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              Monthly Profit (blue) & Cumulative Profit (green)
            </p>
          </div>
        )}

        <div style={{ marginTop: 12, paddingLeft: 12 }}>
          <p style={{ fontSize: 11, color: "#999", margin: 0, textAlign: "center" }}>
            For educational / estimation purposes only.
          </p>
        </div>

        </div>        
      )}


      {/* ---------------- Assumptions (now = current params) ---------------- */}
      {result && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer" }}>Show assumptions (current parameters)</summary>
          <div style={{ marginTop: 10, color: "#333", lineHeight: 1.8 }}>
            <div><strong>Months:</strong> {params.months}</div>
            <div>
              <strong>Growth:</strong>{" "}
              {params.growth.type === "linear"
                ? `initial MAU = ${params.growth.initialUsers}, net increase/month = ${params.growth.monthlyIncrease}`
                : `initial users = ${params.growth.initialUsers}, monthly growth = ${Math.round(
                    params.growth.monthlyGrowthRate * 100
                  )}%`}
            </div>
            <div><strong>Free uses/user/month:</strong> {params.freePolicy.freeUsesPerUserPerMonth}</div>
            <div><strong>Costs:</strong> fixed/month = {params.costs.fixedCostPerMonth}, cost/use = {params.costs.costPerUse}</div>
            <div>
              <strong>Monetization:</strong>{" "}
              {params.monetization.type === "per_use" ? (
                <>per-use, price/paid use = {params.monetization.pricePerPaidUse}</>
              ) : params.monetization.type === "subscription" ? (
                <>
                  subscription, $/user/month = {params.monetization.pricePerUserPerMonth},
                  penetration = {Math.round(params.monetization.penetrationRate * 100)}%,
                  included uses/sub/month = {params.monetization.includedUsesPerSubscriberPerMonth}
                </>
              ) : (
                <>lifetime, one-time price/user = {params.monetization.oneTimePricePerUser}</>
              )}
            </div>

            {params.monetization.type !== "subscription" && (
              <>
              <div>
                <strong>Segments:</strong>
                <ul style={{ marginTop: 6 }}>
                  {params.segments.map((s) => (
                    <li key={s.name}>
                      {s.name}: {Math.round(s.ratio * 100)}% users, extra paid uses/user/month = {s.extraPaidUsesPerUserPerMonth}
                    </li>
                  ))}
                </ul>
              </div>          

              <div>
                <strong>Paid usage model:</strong> {paidUsageModel}
              </div>
              
              {paidUsageModel === "simple" && (
                <div style={{ color: "#333" }}>
                  <strong>Simple params:</strong>{" "}
                  paying ratio = {payingUserRatioPct.number}%,{" "}
                  paid uses/paying user/month = {paidUsesPerPayingUser.number}
                </div>
              )}
              </>
            )}
          
          </div>
        </details>
      )}

      {/* Risks from engine */}
      {result && result.risks.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer" }}>Show engine warnings</summary>
          <ul style={{ marginTop: 10 }}>
            {result.risks.map((r, idx) => (
              <li key={idx}>
                [{r.severity}] {r.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* support */}
      <div
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: "1px solid #eee",
          fontSize: 14,
          color: "#555",
        }}
      >
        <p style={{ marginBottom: 8 }}>
          If this tool helped you, you can support its continued development.
        </p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <a 
            href="https://ko-fi.com/launchpath" 
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "underline" }}
          >
            Support / Donate
          </a>
          <a href="https://docs.google.com/forms/d/e/1FAIpQLSd67mhV1tlO9QHAlDf5sA_iDPmuVAj7a3v0g3otiv8PDti0Aw/viewform?usp=header" 
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "underline" }}>
            Send feedback
          </a>
        </div>
      </div>

    </div>
  );
}
