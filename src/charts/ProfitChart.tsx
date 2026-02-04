import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const formatCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

export function ProfitChart({ rows }: { rows: any[] }) {
  return (
    <div style={{ width: "100%", height: 380, minWidth: 0, minHeight: 0   }}>
      <ResponsiveContainer  width="100%" height="100%" >
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="monthIndex" tickCount={5} />
          <YAxis
            width={64} tickFormatter={formatCompact}
            domain={[dataMin => Math.min(dataMin, 0), "auto"]}
            padding={{ bottom: 20 }}
          />
          <Tooltip
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : 0;
              return [`${n.toLocaleString()}`, name];
            }}
          />
          {/* y = 0 baseline */}
          <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />

          <Line
            type="monotone"
            dataKey="profit"
            name="Monthly Profit"
            stroke="#2563eb"
            strokeWidth={3}
            dot={ false }
            activeDot={{ r: 6 }}
          />

          <Line
            type="monotone"
            dataKey="cumulativeProfit"
            name="Cumulative Profit"
            stroke="#16a34a"
            strokeDasharray="5 5"
            dot={ false }
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
