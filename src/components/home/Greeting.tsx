"use client";

import { motion } from "motion/react";
import { useData } from "@/lib/data-store";
import s from "./home.module.css";

function partOfDay(h: number) {
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Up late";
}

/** Oversized greeting set behind the figure. Sits under the 3D stage in the stacking order. */
export default function Greeting({ intro }: { intro: boolean }) {
  const st = useData();
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: st.profile.timezone }).format(new Date()));
  const greeting = partOfDay(hour);
  const first = st.profile.name.trim().split(/\s+/)[0] || "there";
  return (
    <motion.div
      className={s.greeting}
      aria-label={`${greeting}, ${first}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { delay: intro ? 0.5 : 0.1, duration: 1.4, ease: [0.2, 0.7, 0.2, 1] } }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      <div className={s.greetFade}>
        <div className={s.greetSmall}>{greeting},</div>
        <div className={s.greetBig}>{first}</div>
      </div>
    </motion.div>
  );
}
