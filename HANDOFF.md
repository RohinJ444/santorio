# Soma: handoff from the visual first pass

First pass at the look and interactions, built by Claude Code. Next steps from here
(data, persistence, auth, performance, deploy) go to Codex. Everything below
describes what exists and where the seams are.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # passes; every route prerenders as static
```

Personal project: keep it in a personal GitHub account and a personal Vercel
account, and keep WindBorne data out of it.

## What's here

| Screen | Route | State |
| --- | --- | --- |
| Body (home) | `/` | Hologram body, callouts, goals strip, greeting. Mind is intentionally inactive. |
| Training | `/workout` | Day view with sessions, set logging sheet, history by setup. |
| Nutrition | `/diet` | Day view with totals, meals, meal-prep portion and ingredient edits, add-food sheet. |
| Settings | `/settings` | Profile, weigh-ins, BMR/TDEE, goals. |

All data is **mock and in memory**. It resets on reload.

## Architecture

- **One persistent shell.** `src/components/AppShell.tsx` lives in the root layout and renders every screen based on the pathname. Route `page.tsx` files return `null`. That keeps the 3D canvas mounted across navigation, so leaving home is a camera move rather than a page swap. Views animate in and out with `motion`'s `AnimatePresence`.
- **Client-only render.** The shell renders after mount (`useSyncExternalStore` gate) because "today" and the mock data depend on the device clock.
- **State.** `src/lib/store.tsx` is a small React context with actions. Replace it with the real data layer. Its action names map closely to the mutations needed: `saveSet`, `deleteSet`, `startWorkout`, `setPortion`, `nudgeIngredient`, `addFood`, `addWater`, `addWeighIn`, `updateProfile`, `updateGoals`.
- **Data model.** `src/lib/types.ts` is a proposal shaped by the Notes logs:
  - `ExerciseEntry.exerciseId` is a stable identity, so history lines up even when names drift.
  - `equipment` and the workout's `gym` define "same setup". `src/lib/history.ts` only compares numbers on the same setup and labels other gyms or machines separately.
  - A set is a list of `Segment`s. Drops (`link: "drop"`) and rest-pause (`link: "pause"`) are extra segments. `sides: {R, L}` replaces `reps` for per-side sets. Partial reps are fractional (`7.5`).
  - `assisted: true` means the weight is assistance, so lower is stronger. It's excluded from volume.
  - Meal-prep `FoodItem`s keep their own copy of the ingredients, so editing a template never rewrites history. `change` notes record deviations from the template (`more`, `less`, `swap`, `added`).
  - Weight is a log (`WeighIn[]`), not a setting.
- **Energy.** `src/lib/energy.ts` computes BMR with Mifflin–St Jeor. With sex unset, it uses the midpoint constant. TDEE is BMR × an activity factor and is shown as an estimate (`≈`, dashed underline) everywhere.

## The 3D stage (`src/components/stage/`)

- `Body.tsx`
  - Loads `public/models/body.glb` and normalizes it to 1.8 m tall.
  - Hides the two prop meshes bundled with the model (an axe and a pickaxe).
  - Places the procedural organs on the skeleton.
  - Projects anchor points for the DOM callouts every frame through `anchors.ts`. The callouts then move via `setAttribute` and transforms, with no React render per frame.
- `subdivide.ts`: one level of Loop subdivision on the skinned body at load (skin weights blended), so the low-poly base mesh reads as a smooth silhouette.
- `pose.ts`: a procedural build and idle pose. It widens the shoulders once by moving the arm joints out, then each frame applies: a shoulder-width stance, loose dropped shoulders, relaxed arms, a light weight shift, breathing and a head look-around. Posture is measured, not hand-set: each frame it aligns legs, torso, neck and head to a side-view plumb line and sets arm and forearm angles by measurement. Targets are the constants at the top of `pose.ts`. Dev console helpers: `__rig.lock = <radians>` freezes the turntable (front is `-Math.PI / 2`), `__rig.shot = { pos, look }` overrides the camera, and `__pose()` prints segment leans, plumb offsets and bone directions in body axes. It resets bones to rest each frame and layers rotations in body axes measured from the skeleton. The model's bundled animation clips aren't used.
- `materials.ts`: GLSL for the hologram (scan rings, meridians, fresnel rim, entrance reveal). It includes three's skinning chunks, so it works on the skinned mesh. It also has the organ glow and the floor glow.
- `organs.ts`: brain and digestive tract built procedurally, so the only downloaded asset is the body.
- `Stage.tsx`
  - Canvas, per-route camera shots, and drag-to-spin.
  - Frame loop: `frameloop` is `"always"` only on home. Elsewhere it is `"demand"`, rendering only while the camera is still moving, so the dimmed background costs nothing once settled.

The body model is a CC0 base mesh by orange-juice-games, taken from [github.com/BoQsc/Godot-3D-Male-Base-Mesh](https://github.com/BoQsc/Godot-3D-Male-Base-Mesh), release 1.0.3 (`male_base_mesh_idle_final.glb`). Verify the license before shipping.

## Not done / open for Codex

- Persistence, auth (single user), Supabase schema, deploy.
- No-op buttons:
  - **Add exercise**
  - **Gym chip:** should open a gym picker
  - **Units:** lb only
- **Steps:** a web app can't read Apple Health. The options are manual entry, or an iOS Shortcuts automation that POSTs daily steps.
- **No service worker.** Installable via the manifest and icons; needs a connection to work.
- **Performance on a real iPhone isn't profiled.** DPR is clamped to 2. Things to check if needed: shader cost of the additive double-sided hologram, and the per-frame bone math in `pose.ts` (about 20 bones).
- **Trends:** the greyed-out trend icons in both day views are placeholders for later per-exercise and diet history charts. History is already stored in a structured form for them.
- **Mind:** intentionally greyed out on home.
