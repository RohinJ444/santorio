"use client";

/**
 * Home HUD. Layers, bottom to top:
 *   scroller: first screen is the "hero" (transparent over the 3D body; it
 *             carries the spin/tap gestures and the goal tiles), then insights
 *   callouts: fixed labels tracking the body; fade out as you scroll
 *   header:   date + settings
 * Scroll progress is published as --home-scroll so the body and greeting dim with it.
 */
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type UIEvent } from "react";
import { fmtInt } from "@/lib/energy";
import { parseIso } from "@/lib/dates";
import { useStore } from "@/lib/store";
import Insights from "../insights/Insights";
import { rig } from "../stage/anchors";
import { useBodyGestures } from "../stage/gestures";
import { Gear } from "../ui/icons";
import BalanceTile from "./BalanceTile";
import Callouts from "./Callouts";
import s from "./home.module.css";

type Props = { intro: boolean };

export default function HomeOverlay({ intro }: Props) {
  const st = useStore();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const today = st.days[st.today];
  const qin = st.dayNutrients(st.today).kcal;
  const qout = st.tdee;
  const balance = qin - qout;
  const steps = today?.steps ?? 0;
  const water = today?.waterL ?? 0;
  const d = parseIso(st.today);
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const gestures = useBodyGestures((part) => {
    if (part === "gut") router.push("/diet");
    else rig.jumpRequested = true;
  });

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const p = Math.min(1, el.scrollTop / (el.clientHeight * 0.55));
    document.documentElement.style.setProperty("--home-scroll", p.toFixed(3));
    if (root.current) root.current.dataset.scrolled = p > 0.15 ? "1" : "";
  };
  useEffect(() => () => document.documentElement.style.setProperty("--home-scroll", "0"), []);

  const delay = (base: number) => (intro ? base : 0.05);

  return (
    <motion.div
      ref={root}
      className={s.overlay}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      <div className={s.scroller} onScroll={onScroll}>
        <section className={s.hero} {...gestures}>
          <motion.div
            className={s.bottom}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0, transition: { delay: delay(1.9), duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } }}
          >
            <div className={s.tiles}>
              <BalanceTile balance={balance} target={st.balanceTarget} />
              <div className={s.tile} style={{ ["--c" as string]: "var(--out)" }}>
                <div className={s.tileKey}>Steps</div>
                <div className={s.tileVal}>
                  {fmtInt(steps)}
                  <small>/{st.goals.steps / 1000}k</small>
                </div>
                <div className={s.bar}>
                  <i style={{ width: `${Math.min(100, (steps / st.goals.steps) * 100)}%` }} />
                </div>
              </div>
              <Link href="/diet" className={s.tile} style={{ ["--c" as string]: "#7cc4ff" }}>
                <div className={s.tileKey}>Water</div>
                <div className={s.tileVal}>
                  {water.toFixed(1)}
                  <small>/{st.goals.waterL}L</small>
                </div>
                <div className={s.bar}>
                  <i style={{ width: `${Math.min(100, (water / st.goals.waterL) * 100)}%` }} />
                </div>
              </Link>
            </div>
            <div className={s.more} aria-hidden>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </motion.div>
        </section>

        <section className={s.insights}>
          <div className={s.insightsHead}>
            <span>Insights</span>
            <span className={s.insightsSub}>last 14 days</span>
          </div>
          <Insights />
        </section>
      </div>

      <div className={s.fadeOnScroll}>
        <Callouts
          intro={intro}
          qin={qin}
          qout={qout}
          onOpen={(r) => router.push(r === "diet" ? "/diet" : "/workout")}
        />
      </div>

      <motion.header
        className={s.top}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0, transition: { delay: delay(0.2), duration: 0.6 } }}
      >
        <div className={s.date}>
          <b>{wd}</b> {md}
        </div>
        <Link href="/settings" className={s.iconBtn} aria-label="Settings">
          <Gear size={19} />
        </Link>
      </motion.header>
    </motion.div>
  );
}
