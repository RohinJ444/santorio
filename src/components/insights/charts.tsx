/** Minimal SVG charts in the HUD style. No chart library: these are tiny and fully styled by CSS vars. */

type BarsProps = {
  /** null = no data that day: drawn as a faint dashed placeholder, never as a value */
  values: (number | null)[];
  labels?: string[];
  color?: string;
  negColor?: string; // diverging around zero when set
  highlight?: number;
  avg?: boolean;
  goal?: number; // dashed reference line
  zero?: boolean; // bars start at zero (counts); otherwise they start near the smallest value to show variation
  height?: number;
};

export function Bars({ values, labels, color = "var(--out)", negColor, highlight, avg, goal, zero, height = 74 }: BarsProps) {
  const diverging = !!negColor;
  const known = values.filter((v): v is number => v !== null);
  const max = Math.max(...known.map((v) => (diverging ? Math.abs(v) : v)), goal ?? 0, 1);
  const lo = diverging ? -max : zero ? 0 : Math.min(...known, max) * 0.82;
  const hi = max;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const n = values.length;
  const w = 100 / n;
  const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
        {diverging && <line x1={0} x2={100} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {values.map((v, i) => {
          if (v === null) {
            // a varied but fixed silhouette, outlined only, so an empty chart still has shape without implying values
            const h = height * (diverging ? 0.12 + ((i * 7) % 5) / 14 : 0.22 + ((i * 7) % 5) / 9);
            const up = !diverging || i % 3 !== 1;
            return <rect key={i} x={i * w + w * 0.18} width={w * 0.64} y={diverging ? (up ? y(0) - h : y(0)) : height - h} height={h} rx={0.8} fill="var(--line)" stroke="var(--line-strong)" strokeDasharray="2 2" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.6} />;
          }
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
        {avg && mean !== null && <line x1={0} x2={100} y1={y(mean)} y2={y(mean)} stroke="var(--text-2)" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.6} />}
        {goal !== undefined && <line x1={0} x2={100} y1={y(goal)} y2={y(goal)} stroke={color} strokeDasharray="2 3" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.5} />}
      </svg>
      {labels && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)`, marginTop: 6 }}>
          {labels.map((l, i) => (
            <span key={i} style={{ textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 10, color: highlight === i ? "var(--text)" : "var(--text-3)" }}>
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** null breaks the line; a lone point between gaps is drawn as a dot. */
type Series = { values: (number | null)[]; color: string; dashed?: boolean };

export function Lines({ series, height = 80 }: { series: Series[]; height?: number }) {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const ghost = (color: string, k: number) => <path key={`ghost${k}`} d={`M0,${height * (0.62 - k * 0.2)} C25,${height * (0.45 - k * 0.2)} 55,${height * (0.75 - k * 0.2)} 100,${height * (0.5 - k * 0.2)}`} fill="none" stroke={color} strokeDasharray="3 4" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.35} />;
  if (!all.length) return <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>{series.map((s, k) => ghost(s.color, k))}</svg>;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 1;
  const y = (v: number) => height - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * height;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block", overflow: "visible" }}>
      {series.map((s, k) => {
        if (s.values.every((v) => v === null)) return ghost(s.color, k);
        const n = s.values.length;
        const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
        let d = "";
        const dots: number[] = [];
        s.values.forEach((v, i) => {
          if (v === null) return;
          const prev = s.values[i - 1] ?? null, next = s.values[i + 1] ?? null;
          d += `${prev === null ? "M" : "L"}${x(i)},${y(v)} `;
          if (prev === null && next === null) dots.push(i);
        });
        return (
          <g key={k}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dashed ? "4 3" : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {dots.map((i) => <line key={i} x1={x(i)} x2={x(i)} y1={y(s.values[i]!)} y2={y(s.values[i]!)} stroke={s.color} strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
          </g>
        );
      })}
    </svg>
  );
}
