import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const formatCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};


export function RevenueCostChart({ rows }: { rows: any[] }) {
  return (
    <div style={{ width: "100%", height: 380 }}>
      <ResponsiveContainer>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="monthIndex" tickCount={5} />
          <YAxis width={64} tickFormatter={formatCompact} />
          <Tooltip
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : 0;
              return [`${n.toLocaleString()}`, name];
            }}
          />
          <Line type="monotone" 
            dataKey="revenue" 
            name="Revenue" 
            stroke="#28df4f" 
            strokeWidth={3} 
            dot={false}
            activeDot={{ r: 6 }}
            />
          <Line type="monotone" 
            dataKey="totalCost" 
            name="Total Cost" 
            stroke="#f65fd2" 
            strokeWidth={2} 
            dot={false}
            activeDot={{ r: 6 }}
            />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
