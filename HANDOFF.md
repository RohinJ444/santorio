# Santorio: current implementation handoff

Updated 2026-10-16 after the backend implementation. Claude's approved home visuals remain; the app now has real authentication and persistent data. This document supersedes the original mock-data handoff.

## Local UI iteration

Work in `/Users/rohinjuneja/Documents/santorio` using Node 24 (`.nvmrc`). The default system shell may still resolve Node 20; select Node 24 before running commands.

```bash
npm ci          # when dependencies need installing
npm run dev     # http://localhost:3417, with hot reload
npm run build   # production build; includes dynamic authenticated API routes
```

The local server may already be running on 3417; reuse it. Local `.env.local` must keep `APP_URL=http://localhost:3417`. Cookie-authenticated writes require an exact matching origin, so changing ports requires updating that configuration and the auth redirect allowlist.

Production is https://santorio-gamma.vercel.app. Localhost and production have separate sign-in cookies but use the same Supabase project and owner data. Local UI edits appear through hot reload; no deployment is needed until publishing a chosen version. Keep secrets in ignored environment files. GitHub actions/pushes and new worktrees require the owner's approval. Keep workplace data out of this personal project.

## Active implementation

- `src/components/AppShell.tsx`: persistent visual shell, authentication, onboarding, route views and transitions. Most route `page.tsx` files return null.
- `src/components/prototype/`: active workout, nutrition, settings, onboarding, authentication and OAuth consent screens, shared controls and CSS. Original mock workout/diet components are not the active screens.
- `src/lib/data-store.tsx`, `sync-engine.ts`, `draft-storage.ts`: optimistic state, local drafts, per-tab journals, queued saves and explicit version conflicts. Preserve these when polishing visuals; do not restore `src/lib/store.tsx` mock state.
- `src/lib/domain/`: active types, validation, workout/nutrition calculations and tests. `CONTRACT.md` describes the collection structure.
- `src/app/api/`, `src/lib/server/`: Next.js APIs and Supabase Auth/Postgres integration. `docs/backend.md` documents endpoints and security boundaries.
- Home overlays and insights read saved data through `useData`; missing values stay unknown, with no seeded history. Profile-based energy estimates are labeled as estimates.

Workout screens now support multiple sessions per day, inline partial set logging, custom exercises and muscle groups, editable targets, routines, locations, equipment comparisons, unilateral reps/loads, drops/rest pauses, and cardio. Nutrition supports detailed foods, reusable recipe families, batches, estimated fractions or ingredient-equivalent portions, customized plates, supplements, and immutable logged snapshots.

The live MCP at https://santorio-gamma.vercel.app/api/mcp exposes 13 tools: food/recipe and exercise/workout search, get and save, plus read-only gym lookup, with OAuth/PKCE/CIMD. Workouts use separate read/write permissions. It does not expose raw Health data, daily meal logging or batch creation. ChatGPT's complete connection/tool-call flow still needs user-side validation.

## Remaining work

- UI/UX polish and complete interactive workout/nutrition acceptance tests. Production endpoint checks and signed-in home rendering pass, but these are not complete acceptance tests.
- Health Auto Export receiver, file upload, token management and Watch linking are implemented locally. The Health migrations are applied and the October 4 sample is imported; public deployment and phone automation setup remain pending. See docs/backend.md. Do not change the approved home labels or visuals while connecting data. Imported resting energy is reference only; home expenditure uses estimated BMR + daily active energy. The complete-day Health trend tile remains empty when coverage is unknown.
- Password recovery exists; the actual recovery-email flow needs user testing.
- No service worker: reopening the app requires a connection. Current browsers use Web Locks to recover closed-tab drafts; older-browser fallback only automatically recovers the current session.
- Real-iPhone performance profiling remains, especially shaders and procedural pose math. More detailed trend visuals can follow later. Mind stays intentionally disabled.

Use `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` for changes affecting behavior. Pure visual refinements should preserve inline autosave, keyboard behavior, snapshots, unknown nutrient values and existing data contracts.

## The 3D stage (`src/components/stage/`)


- Gestures come from the DOM layer above the canvas (`gestures.ts`). The home hero has `touch-action: pan-y`, so vertical pans scroll natively, sideways drags spin the body, and still taps are raycast through `anchors.pick`. Tap-to-jump is a keyframed crouch, air and landing timeline in `Body.tsx` that drives extra pose motion.

- `Body.tsx`
  - Loads `public/models/body.glb` and normalizes it to 1.8 m tall.
  - Hides the two prop meshes bundled with the model (an axe and a pickaxe).
  - Places the procedural organs on the skeleton.
  - Projects anchor points for the DOM callouts every frame through `anchors.ts`. The callouts then move via `setAttribute` and transforms, with no React render per frame.
- `subdivide.ts`: one level of Loop subdivision on the skinned body at load (skin weights blended), so the low-poly base mesh reads as a smooth silhouette.
- `pose.ts`: a procedural build and idle pose. It widens the shoulders once by moving the arm joints out, then each frame applies: a shoulder-width stance, loose dropped shoulders, relaxed arms, a light weight shift, breathing and a head look-around. Posture is measured, not hand-set: each frame it aligns legs, torso, neck and head to a side-view plumb line and sets arm and forearm angles by measurement. Targets are the constants at the top of `pose.ts`. Dev console helpers: `__rig.lock = <radians>` freezes the turntable (front is `-Math.PI / 2`), `__rig.shot = { pos, look }` overrides the camera, `__rig.jumpScrub = 0.45` holds the jump at a moment, and `__pose()` prints segment leans, plumb offsets and bone directions in body axes. It resets bones to rest each frame and layers rotations in body axes measured from the skeleton. The model's bundled animation clips aren't used.
- `materials.ts`: GLSL for the hologram (scan rings, meridians, fresnel rim, entrance reveal). It includes three's skinning chunks, so it works on the skinned mesh. It also has the organ glow and the floor glow.
- `organs.ts`: brain and digestive tract built procedurally, so the only downloaded asset is the body.
- `Stage.tsx`
  - Canvas, per-route camera shots, and drag-to-spin.
  - Frame loop: `frameloop` is `"always"` only on home. Elsewhere it is `"demand"`, rendering only while the camera is still moving, so the dimmed background costs nothing once settled.

The original visual handoff identifies the body model as a CC0 base mesh by orange-juice-games, taken from [github.com/BoQsc/Godot-3D-Male-Base-Mesh](https://github.com/BoQsc/Godot-3D-Male-Base-Mesh), release 1.0.3 (`male_base_mesh_idle_final.glb`). That license attribution has not been independently verified in the backend implementation pass.
