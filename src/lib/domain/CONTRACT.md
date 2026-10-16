# Shared UI/backend contract

Types live in types.ts. Root owns types.ts, data-store.tsx, shared controls, settings/onboarding/auth UI, home integration, packages and deployment. Coordinate changes to types with root.

UI imports useData from @/lib/data-store. It provides:
- records: RecordsState (collections map IDs to typed values)
- user: {id,email}
- profile: ProfileRecord (records.profiles.profile or default)
- today: YYYY-MM-DD in profile timezone
- upsert<K extends Collection>(collection: K, entity: Collections[K]): void (optimistic + durable queue)
- remove(collection: Collection, id: string): void (soft delete + durable queue)
- status: 'loading'|'saved'|'saving'|'offline'|'error'|'conflict'
- error: string|null; retry(): void; refresh(): Promise<void>
- pendingCount: number
- signOut(): Promise<void>

Shared UI in @/components/prototype/controls exports:
- DayNav({date,onChange,markedDates?:string[],label?:string}) month picker + date arrows
- NumberField({label,value:number|null,onChange,min?,max?,step?,placeholder?,className?}) allows temporary drafts and inline autosaving
- TextField({label,value,onChange,placeholder?,multiline?})
- Modal({title,onClose,children}) accessible dialog
- SaveStatus() persistent status and retry/conflict support
- NumberField compact: input only (aria-labelled) for dense rows such as sets
- Segmented({options,value,onChange,label}) tabs and unit toggles
- ViewHeader({q?,label,action?,children}) back-to-body, Q key and title; children hold DayNav and SaveStatus (quiet unless error/offline/conflict)
CSS: @/components/prototype/prototype.module.css root will provide class names page,header,toolbar,title,subtle,card,stack,row,field,input,select,button,primary,danger,small,grid,empty,tabs,active,badge,summary,table,error,sectionTitle,divider. Agents may create own CSS files for domain-specific layout; don't edit shared CSS.

Backend API:
GET /api/bootstrap -> BootstrapResponse
PUT /api/records/[collection]/[id] body {data,expectedVersion,mutationId} -> StoredRecord; first expectedVersion=0.
DELETE same URL body {expectedVersion,mutationId} -> StoredRecord tombstone.
409 -> {error,current:StoredRecord|null}. Idempotent mutation ID, optimistic version checks required.
Auth endpoints agent owns and should communicate exact contract to root. /api/auth/status can distinguish owner setup required vs ready; login/signup only allow configured OWNER_EMAIL. RLS must enforce owner allowlist too. No mock authenticated bypass.

Record IDs are UUIDs except singleton profile='profile' and metrics IDs can be YYYY-MM-DD. Each logical aggregate is atomic; nested sets/ingredients are JSONB and snapshots are deliberate. Backend must validate collection-specific payloads and reject unknown collections/fields. Private records are owner-scoped and versioned. No secret keys sent to browser. Root provisions env/project. Agent writes migration using Supabase CLI migration new once root installs CLI. Remote apply_migration happens only after review by root.

Nutrient keys: energy(kcal),protein(g),carbs(g),fat(g) required known numbers for foods. Other nutrients extensible but use canonical units/keys; null means unknown. Recipe ingredients snapshot food revisions. quantity+unit describes actual food amount; a 'serving' means one basis quantity. Conversion supports mass g/oz/lb/kg; volume only when compatible, never guess density. Diary prep ingredients snapshot full batch and multiplier=consumed fraction. Editing serving details can alter those private ingredient quantities without changing batch.


Health import contracts:
- GET /api/health/connection -> {connected,createdAt,lastImportedAt,lastResult,endpoint}; POST -> {token,endpoint,createdAt}; DELETE -> {ok:true}. Never persist or log the returned plaintext token in the client.
- POST /api/health/upload (owner cookie + Origin) and /api/health/import (dedicated Bearer token) accept raw JSON v2. Daily summaries require `X-Santorio-Aggregation: days` or `Automation-Aggregation: days`.
- Import result -> {ok:true,created,updated,unchanged,counts:{days,workouts,measurements},warnings,importedAt}.
- Metrics carry optional healthSources per imported field. Imported values replace their own fields; omitted values and manual water are preserved. completeDay is false because exporter coverage is not provable.
- WorkoutSession and SessionExercise can reference healthWorkoutIds. A Watch workout may belong to one whole session or one exercise across all sessions; explicit unlink before moving. Repeating/routine conversion clears associations. Server trigger enforces availability/uniqueness under the owner lock.
