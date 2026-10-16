"use client";

import Link from "next/link";
import { balanceStatus, fmtSigned } from "@/lib/energy";
import s from "./home.module.css";

const TONE = { on: "var(--in)", under: "var(--out)", over: "var(--warn)" } as const;

/**
 * Energy balance vs target, read through the day. The track is centered on
 * maintenance (0). The dot is where you are now; it moves right as you eat.
 * The white tick is the target. The shaded gap between them is what's left
 * (cyan) or how far over you are (amber); green when you're on target.
 */
export default function BalanceTile({ balance, target }: { balance: number | null; target: number }) {
  if (balance === null) return (
    <Link href="/settings" className={s.tile} aria-label="Energy balance unavailable. Complete your profile and log food.">
      <div className={s.tileKey}>Energy balance</div>
      <div className={s.tileVal}>—<small>/{fmtSigned(target)}</small></div>
      <div className={s.balBar} aria-hidden><div className={s.balTrack} /><div className={s.balZero} /></div>
      <div className={s.tileSub}>Needs intake + energy</div>
    </Link>
  );
  const { state, remaining } = balanceStatus(balance, target);
  // scale to the numbers in play so the bar stays readable at tile width
  const half = Math.max(500, Math.abs(target) * 1.6, Math.abs(balance) * 1.1);
  const pos = (v: number) => 50 + Math.max(-1, Math.min(1, v / half)) * 50;
  const now = pos(balance);
  const goal = pos(target);

  const label = state === "on"
      ? "on target"
      : state === "under"
        ? `${Math.round(remaining)} kcal to go`
        : `${Math.round(-remaining)} kcal over`;

  return (
    <Link
      href="/diet"
      className={s.tile}
      style={{ ["--c" as string]: TONE[state] }}
      aria-label={`Energy balance ${fmtSigned(balance)} kcal, target ${fmtSigned(target)}, ${label}`}
    >
      <div className={s.tileKey}>Energy balance</div>
      <div className={s.tileVal}>
        {fmtSigned(balance)}
        <small>/{fmtSigned(target)}</small>
      </div>
      <div className={s.balBar} aria-hidden>
        <div className={s.balTrack} />
        <div className={s.balZero} />
        <div className={s.balGap} style={{ left: `${Math.min(now, goal)}%`, width: `${Math.abs(goal - now)}%` }} />
        <div className={s.balTarget} style={{ left: `calc(${goal}% - 1px)` }} />
        <div className={s.balNow} style={{ left: `calc(${now}% - 4px)` }} />
      </div>
      <div className={s.tileSub}>
        <span className={s.tone}>{label}</span>
      </div>
    </Link>
  );
}
