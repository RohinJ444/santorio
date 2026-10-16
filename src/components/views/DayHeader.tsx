"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { fmtDay, relLabel } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { ChevronLeft, ChevronRight, Figure, Trend } from "../ui/icons";
import v from "./views.module.css";

type Props = { q: "in" | "out"; label: string };

/** Shared by the workout and diet views: back-to-body, section key, greyed trends, ‹ day ›. */
export default function DayHeader({ q, label }: Props) {
  const st = useStore();
  const router = useRouter();
  const [dir, setDir] = useState(0);
  const shift = (n: number) => {
    setDir(n);
    st.shiftDate(n);
  };

  return (
    <div className={v.head}>
      <div className={v.headRow}>
        <button className={v.iconBtn} onClick={() => router.push("/")} aria-label="Back to body">
          <Figure size={20} />
        </button>
        <div className={v.section}>
          <span className={v.qKey}>
            Q<sub>{q}</sub>
          </span>
          {label}
        </div>
        <button className={v.iconBtn} aria-disabled="true" aria-label="Trends (later)" tabIndex={-1}>
          <Trend size={19} />
        </button>
      </div>
      <div className={v.dateNav}>
        <button className={v.dateBtn} onClick={() => shift(-1)} aria-label="Previous day">
          <ChevronLeft size={22} />
        </button>
        <div className={v.dateLabel}>
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={st.date}
              className={v.dateMain}
              custom={dir}
              variants={{
                enter: (d: number) => ({ x: d * 40, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d * -40, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
            >
              {fmtDay(st.date)}
            </motion.div>
          </AnimatePresence>
          <div className={v.dateSub}>{relLabel(st.date, st.today)}</div>
        </div>
        <button className={v.dateBtn} onClick={() => shift(1)} aria-label="Next day">
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
}

/** Horizontal swipe on a view changes the day. */
export function useSwipeDays(onShift: (n: number) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s0 = start.current;
      start.current = null;
      if (!s0) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s0.x;
      const dy = t.clientY - s0.y;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) onShift(dx < 0 ? 1 : -1);
    },
  };
}

export const viewMotion = {
  initial: { opacity: 0, y: 34 },
  animate: { opacity: 1, y: 0, transition: { delay: 0.28, duration: 0.55, ease: [0.2, 0.7, 0.2, 1] as const } },
  exit: { opacity: 0, y: 14, transition: { duration: 0.2 } },
};
