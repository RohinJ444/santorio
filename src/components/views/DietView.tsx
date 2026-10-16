"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { fmtTime } from "@/lib/dates";
import { ZERO, add, fmtInt, fmtSigned, foodNutrients, itemNutrients } from "@/lib/energy";
import { FOODS, TEMPLATES, uid } from "@/lib/mock";
import { useStore } from "@/lib/store";
import { fluidOuncesToLiters, waterOunces } from "@/lib/domain/water";
import type { FoodItem, Meal } from "@/lib/types";
import { ChevronRight, Close, Minus, Plus } from "../ui/icons";
import DayHeader, { useSwipeDays, viewMotion } from "./DayHeader";
import v from "./views.module.css";

export default function DietView() {
  const st = useStore();
  const day = st.days[st.date];
  const total = st.dayNutrients(st.date);
  const [adding, setAdding] = useState(false);
  const swipe = useSwipeDays(st.shiftDate);
  const g = st.goals;
  const du = total.kcal - st.tdee;

  return (
    <motion.div className={v.view} style={{ ["--c" as string]: "var(--in)" }} {...viewMotion} {...swipe}>
      <DayHeader q="in" label="Nutrition" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={st.date}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.25 } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          <div className={v.card}>
            <div className={v.kicker}>Energy in</div>
            <div className={v.totalRow}>
              <div className={v.big}>
                {fmtInt(total.kcal)}
                <small>kcal</small>
              </div>
              <div className={v.goal}>/ {fmtInt(st.calorieGoal)} goal</div>
            </div>
            <div className={v.meter}>
              <i style={{ width: `${Math.min(100, (total.kcal / st.calorieGoal) * 100)}%` }} />
            </div>
            <div className={v.macros}>
              <Macro label="Protein" value={total.protein} goal={g.proteinG} />
              <Macro label="Carbs" value={total.carbs} />
              <Macro label="Fat" value={total.fat} />
            </div>
            <div className={v.balance}>
              <span>
                TDEE <span className={v.est}>≈{fmtInt(st.tdee)}</span>
              </span>
              <span>
                Energy balance <b>{fmtSigned(du)}</b> kcal · target{" "}
                <b>{st.balanceTarget === 0 ? "maintain" : fmtSigned(st.balanceTarget)}</b>
              </span>
            </div>
          </div>

          <Hydration date={st.date} />

          {(day?.meals ?? []).map((m) => (
            <MealCard key={m.id} meal={m} date={st.date} />
          ))}
          {!day?.meals.length && (
            <div className={v.empty}>
              <div className={v.emptyTitle}>Nothing logged</div>
              Add a meal-prep serving or a single food.
            </div>
          )}

          <button className={v.addRow} onClick={() => setAdding(true)}>
            <Plus size={18} /> Add food
          </button>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>{adding && <AddFoodSheet key="add" onClose={() => setAdding(false)} />}</AnimatePresence>
    </motion.div>
  );
}

function Hydration({ date }: { date: string }) {
  const st = useStore();
  const water = st.days[date]?.waterL ?? 0;
  const goal = st.goals.waterL;
  return (
    <div className={v.card} style={{ ["--c" as string]: "#7cc4ff" }}>
      <div className={v.mealHead}>
        <div className={v.kicker}>Water</div>
        <div className={v.goal}>
          {waterOunces(water)} / {waterOunces(goal)} fl oz
        </div>
      </div>
      <div className={v.meter}>
        <i style={{ width: `${Math.min(100, (water / goal) * 100)}%` }} />
      </div>
      <div className={v.waterBtns}>
        <button className={v.toggle} onClick={() => st.addWater(date, -fluidOuncesToLiters(8))} disabled={water <= 0} aria-label="Remove 8 fluid ounces">
          <Minus size={14} /> 8 fl oz
        </button>
        <button className={v.toggle} onClick={() => st.addWater(date, fluidOuncesToLiters(8))}>
          <Plus size={14} /> 8 fl oz
        </button>
        <button className={v.toggle} onClick={() => st.addWater(date, fluidOuncesToLiters(16))}>
          <Plus size={14} /> 16 fl oz
        </button>
      </div>
    </div>
  );
}

function Macro({ label, value, goal }: { label: string; value: number; goal?: number }) {
  return (
    <div className={v.macro}>
      <span>{label}</span>
      <b>
        {fmtInt(value)}
        <small>{goal ? `/${goal}g` : "g"}</small>
      </b>
      {goal && (
        <div className={v.macroBar}>
          <i style={{ width: `${Math.min(100, (value / goal) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function MealCard({ meal, date }: { meal: Meal; date: string }) {
  const kcal = meal.items.reduce((a, i) => add(a, itemNutrients(i)), ZERO).kcal;
  return (
    <div className={v.card}>
      <div className={v.mealHead}>
        <div className={v.mealName}>
          {meal.name}
          <span>{fmtTime(meal.time)}</span>
        </div>
        <div className={v.mealKcal}>{fmtInt(kcal)} kcal</div>
      </div>
      {meal.items.map((i) => (i.kind === "prep" ? <PrepItem key={i.id} item={i} date={date} /> : <FoodRow key={i.id} item={i} />))}
    </div>
  );
}

function FoodRow({ item }: { item: Extract<FoodItem, { kind: "food" }> }) {
  const n = itemNutrients(item);
  return (
    <div className={v.item}>
      <div>
        <div className={v.itemName}>{FOODS[item.foodId]?.name}</div>
        <div className={v.itemSub}>
          {item.grams} g · {fmtInt(n.protein)} g protein
        </div>
      </div>
      <div className={v.itemKcal}>{fmtInt(n.kcal)}</div>
    </div>
  );
}

/** A meal-prep serving: template → this batch's changes → this portion. */
function PrepItem({ item, date }: { item: Extract<FoodItem, { kind: "prep" }>; date: string }) {
  const st = useStore();
  const [open, setOpen] = useState(false);
  const n = itemNutrients(item);
  const tpl = TEMPLATES[item.templateId];
  const changes = item.ingredients.filter((i) => i.change).length;

  return (
    <div>
      <button className={v.item} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div>
          <div className={v.itemName}>{tpl?.name ?? "Meal prep"}</div>
          <div className={v.itemSub}>
            <span className={`${v.badge} ${v.badgeIn}`}>prep</span>
            {item.batch}
            {changes > 0 && <span className={`${v.badge} ${v.badgeWarn}`}>{changes} changes</span>}
          </div>
        </div>
        <div className={v.itemKcal}>
          {fmtInt(n.kcal)}
          <small>
            {item.portion.toFixed(2)}× · {fmtInt(n.protein)}g P
          </small>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className={v.prepBody}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className={v.portion}>
              <div className={v.portionTop}>
                <span className={v.kicker}>Portion</span>
                <span className={v.portionVal}>{item.portion.toFixed(2)}×</span>
              </div>
              <input
                className={v.range}
                type="range"
                min={0.25}
                max={2}
                step={0.05}
                value={item.portion}
                onChange={(e) => st.setPortion(date, item.id, Number(e.target.value))}
                aria-label="Portion size"
              />
            </div>
            <div style={{ marginTop: 6 }}>
              {item.ingredients.map((g) => {
                const eaten = g.grams * item.portion;
                const k = foodNutrients(g.foodId, eaten).kcal;
                return (
                  <div key={g.foodId} className={v.ingRow}>
                    <div>
                      <div className={v.ingName}>{FOODS[g.foodId]?.name}</div>
                      {g.change && (
                        <div className={`${v.ingNote} ${g.change.kind === "added" ? v.ingNoteIn : ""}`}>{g.change.note}</div>
                      )}
                    </div>
                    <div className={v.ingAmt}>
                      {fmtInt(eaten)} g<small>{fmtInt(k)} kcal</small>
                    </div>
                    <div className={v.nudge}>
                      <button onClick={() => st.nudgeIngredient(date, item.id, g.foodId, -10)} aria-label="Less">
                        <Minus size={14} />
                      </button>
                      <button onClick={() => st.nudgeIngredient(date, item.id, g.foodId, 10)} aria-label="More">
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={v.fine}>
              From template {tpl?.name} v{tpl?.version}. Changes here apply to this serving only, and editing the template later
              won&apos;t rewrite this log.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddFoodSheet({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const addPrep = (templateId: string) => {
    const t = TEMPLATES[templateId];
    st.addFood(st.date, {
      kind: "prep",
      id: uid("i"),
      templateId,
      batch: "New batch",
      portion: 1,
      ingredients: t.ingredients.map((i) => ({ ...i })),
    });
    onClose();
  };
  const addFood = (foodId: string, grams: number) => {
    st.addFood(st.date, { kind: "food", id: uid("i"), foodId, grams });
    onClose();
  };
  const quick: [string, number][] = [
    ["whey", 30],
    ["yogurt", 250],
    ["banana", 120],
    ["egg", 100],
  ];

  return (
    <>
      <motion.div className={v.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className={v.sheet}
        style={{ ["--c" as string]: "var(--in)" }}
        role="dialog"
        aria-label="Add food"
        initial={{ y: "100%" }}
        animate={{ y: 0, transition: { type: "spring", damping: 30, stiffness: 320 } }}
        exit={{ y: "100%", transition: { duration: 0.22 } }}
      >
        <div className={v.grabber} />
        <div className={v.sheetHead}>
          <div>
            <div className={v.sheetTitle}>Add food</div>
            <div className={v.sheetSub}>Meal prep templates scale and adjust after adding</div>
          </div>
          <button className={v.closeBtn} onClick={onClose} aria-label="Close">
            <Close size={18} />
          </button>
        </div>
        <div className={v.groupTitle}>Meal prep</div>
        <div className={v.pickGrid}>
          {Object.values(TEMPLATES).map((t) => {
            const n = t.ingredients.reduce((a, i) => add(a, foodNutrients(i.foodId, i.grams)), ZERO);
            return (
              <button key={t.id} className={v.pick} onClick={() => addPrep(t.id)}>
                <div>
                  <b>{t.name}</b>
                  <span>
                    v{t.version} · {t.ingredients.length} ingredients · {fmtInt(n.protein)} g protein
                  </span>
                </div>
                <em>{fmtInt(n.kcal)} kcal</em>
              </button>
            );
          })}
        </div>
        <div className={v.groupTitle} style={{ marginTop: 18 }}>
          Quick add
        </div>
        <div className={v.pickGrid}>
          {quick.map(([id, grams]) => (
            <button key={id} className={v.pick} onClick={() => addFood(id, grams)}>
              <div>
                <b>{FOODS[id].name}</b>
                <span>{grams} g</span>
              </div>
              <em>
                {fmtInt(foodNutrients(id, grams).kcal)} kcal <ChevronRight size={12} />
              </em>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
