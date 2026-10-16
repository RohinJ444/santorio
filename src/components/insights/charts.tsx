/** Minimal SVG charts in the HUD style. No chart library: these are tiny and fully styled by CSS vars. */

type BarsProps = {
  values: number[];
  labels?: string[];
  color?: string;
  negColor?: string; // diverging around zero when set
  highlight?: number;
  avg?: boolean;
  height?: number;
};

export function Bars({ values, labels, color = "var(--out)", negColor, highlight, avg, height = 74 }: BarsProps) {
  const diverging = !!negColor;
  const max = Math.max(...values.map((v) => (diverging ? Math.abs(v) : v)), 1);
  const lo = diverging ? -max : Math.min(...values) * 0.82;
  const hi = max;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const n = values.length;
  const w = 100 / n;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
        {diverging && <line x1={0} x2={100} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {values.map((v, i) => {
          const base = diverging ? y(0) : height;
          const top = y(v);
          const c = diverging && v < 0 ? negColor : color;
          return (
            <rect
              key={i}
              x={i * w + w * 0.18}
              width={w * 0.64}
              y={Math.min(base, top)}
              height={Math.max(1, Math.abs(base - top))}
              rx={0.8}
              fill={c}
              opacity={highlight === undefined || highlight === i ? 0.9 : 0.42}
            />
          );
        })}
        {avg && (
          <line
            x1={0}
            x2={100}
            y1={y(mean)}
            y2={y(mean)}
            stroke="var(--text-2)"
            strokeDasharray="3 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            opacity={0.6}
          />
        )}
      </svg>
      {labels && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)`, marginTop: 6 }}>
          {labels.map((l, i) => (
            <span
              key={i}
              style={{
                textAlign: "center",
                fontFamily: "var(--font-sans)",
                fontSize: 10,
                color: highlight === i ? "var(--text)" : "var(--text-3)",
              }}
            >
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type Series = { values: number[]; color: string; dashed?: boolean };

export function Lines({ series, height = 80 }: { series: Series[]; height?: number }) {
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 1;
  const y = (v: number) => height - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * height;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      {series.map((s, k) => {
        const n = s.values.length;
        const d = s.values.map((v, i) => `${i ? "L" : "M"}${(i / (n - 1)) * 100},${y(v)}`).join(" ");
        return (
          <path
            key={k}
            d={d}
            fill="none"
            stroke={s.color}
            strokeWidth={1.6}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
