"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtInt } from "@/lib/energy";
import { parseIso } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { Gear } from "../ui/icons";
import Callouts from "./Callouts";
import s from "./home.module.css";

type Props = { intro: boolean };

export default function HomeOverlay({ intro }: Props) {
  const st = useStore();
  const router = useRouter();
  const today = st.days[st.today];
  const qin = st.dayNutrients(st.today).kcal;
  const qout = st.tdee;
  const du = qin - qout;
  const steps = today?.steps ?? 0;
  const water = today?.waterL ?? 0;
  const d = parseIso(st.today);
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const delay = (base: number) => (intro ? base : 0.05);

  return (
    <motion.div className={s.overlay} initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      <motion.header
        className={s.top}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0, transition: { delay: delay(0.2), duration: 0.6 } }}
      >
        <div className={s.date}>
          <span className={s.live} />
          {wd} <b>{md}</b>
        </div>
        <Link href="/settings" className={s.iconBtn} aria-label="Settings">
          <Gear size={19} />
        </Link>
      </motion.header>

      <Callouts
        intro={intro}
        qin={qin}
        qout={qout}
        onOpen={(r) => router.push(r === "diet" ? "/diet" : "/workout")}
      />

      <motion.footer
        className={s.bottom}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0, transition: { delay: delay(1.9), duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } }}
      >
        <div className={s.equation}>
          ΔU = Q<sub>in</sub> − Q<sub>out</sub> =
          <strong className={du < 0 ? s.neg : s.pos}>
            {du < 0 ? "−" : "+"}
            {fmtInt(Math.abs(du))}
          </strong>
          kcal
        </div>
        <div className={s.tiles}>
          <Link href="/settings" className={s.tile}>
            <div className={s.tileKey}>TDEE</div>
            <div className={s.tileVal}>
              <span className={s.est}>≈{fmtInt(qout)}</span>
            </div>
            <div className={s.tileSub}>est. · BMR {fmtInt(st.bmr)}</div>
          </Link>
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
          <button
            className={s.tile}
            style={{ ["--c" as string]: "#7cc4ff" }}
            onClick={() => st.addWater(0.25)}
            aria-label="Add 250 ml water"
          >
            <div className={s.tileKey}>
              Water <span className={s.tap}>+250</span>
            </div>
            <div className={s.tileVal}>
              {water.toFixed(1)}
              <small>/{st.goals.waterL}L</small>
            </div>
            <div className={s.bar}>
              <i style={{ width: `${Math.min(100, (water / st.goals.waterL) * 100)}%` }} />
            </div>
          </button>
        </div>
      </motion.footer>
    </motion.div>
  );
}
