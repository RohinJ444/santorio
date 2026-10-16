# Santorio

Private workout and nutrition journal with an installable web interface. The original rotating-body home design remains; the journal now uses authenticated, persistent data.

## Local development

Use Node 24 (`.nvmrc`; minimum Node 22). Install with `npm ci`, then run `npm run dev` (defaults to port 3417). Configuration is in an ignored `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
OWNER_EMAIL=rohin.juneja@berkeley.edu
APP_URL=http://localhost:3417
```

Never expose the Supabase secret in client code or commit it. Configure Supabase Auth to require email confirmation. Allow the exact local and production `/api/auth/confirm` URLs and `/api/auth/confirm?intent=recovery` redirects. Set the Site URL to the production origin. Create the owner account in the app, verify the email, and complete optional onboarding. Password reset is available on the sign-in page.

## Architecture

Next.js App Router / React / TypeScript serves the application and API on Vercel. Supabase supplies Postgres and Auth. There is no separate Rails/Rust service. Private, typed aggregates (workouts, food revisions, recipe/batch/meal snapshots, measurements) are stored as versioned JSONB rows with owner RLS, an idempotency ledger, and revision history. All application writes pass collection-specific Zod validation.

The client updates immediately, persists drafts locally, and serializes saves with optimistic version checks. Refreshing recovers queued changes; failed or conflicting saves stay visible. Each tab owns an independent durable journal. On browsers with Web Locks, reopening the app recovers drafts from closed tabs; concurrent edits across tabs or devices resolve version conflicts explicitly. Older browsers recover the current tab through session storage; closed-tab backups remain in local storage but are not automatically claimed without a safe ownership lock. This is draft recovery, not a complete offline PWA: reopening the app still needs a network connection because there is no service worker.

Food nutrient values have explicit units and basis quantities. Unknown nutrients remain unknown. Recipes and batches preserve ingredient revisions; diary entries preserve their consumed snapshot. Batch portions can be entered as fractions or an ingredient equivalent (for example, dry pasta ounces). Customizing one meal does not modify its batch or template.

Workout sessions support multiple workouts per date, saved locations, reusable routines, custom exercises/muscle groups, editable targets, inline partial sets, unilateral reps/loads, warmups, drops/rest pauses, and cardio. Repeating a workout clears actual performance while retaining its structure. History compares compatible exercise setups and units. Cross-session transfer is deferred until it can be saved atomically.

## MCP and Health

`/api/mcp` exposes food/recipe library tools plus exercise/workout search, read and save tools, and saved-gym lookup, using Streamable HTTP. Nutrition and workouts use separate OAuth read/write scopes; existing nutrition-only grants do not gain workout access automatically. OAuth supports PKCE, CIMD, a registration fallback, scoped opaque tokens, revocation, and consent. See [backend configuration](docs/backend.md). The browser can refresh data added by MCP when returning to the app.

Apple Health imports are implemented locally through Health Auto Export JSON v2. Settings supports file uploads and a revocable REST import token. Imports update daily activity, body measurements and Watch workouts, preserving manual water and absent fields. Watch sessions can be linked to a whole workout or a single exercise. Daily expenditure uses the profile BMR estimate plus imported daily active energy; neither workout calories nor the activity factor are added again. Exported resting energy stays available for reference. See [Health setup](docs/backend.md#health-auto-export-setup). Publishing the receiver and configuring the phone automations remain pending owner approval.

## Checks

```
npm test
npm run typecheck
npm run lint
npm run build
```

Domain tests cover portion/unit math, immutable meal snapshots, missing nutrients, exercise setup matching, partial/unilateral sets, and offline/concurrent saves. Server tests cover validation, OAuth/CIMD, recovery authorization, and MCP transport. `src/lib/server/backend.integration.sql` runs database checks inside a rollback-only transaction and leaves no test account or journal records. Live CIMD fetch tests are opt-in.

Supabase migrations are versioned in `supabase/migrations`. Apply changes deliberately to the intended project. Deployment uses the linked Vercel project; Git pushes still require owner approval. This is a personal project: do not add workplace data.
