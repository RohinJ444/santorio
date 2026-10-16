# Santorio backend

Next.js Route Handlers run the API on Node.js. Supabase supplies Postgres and owner authentication. The browser uses HttpOnly same-site session cookies through our API; no service credential is exposed to it. Sign-up is restricted to rohin.juneja@berkeley.edu, requires email confirmation, and database policies also check that confirmed owner identity. Set the Supabase confirmation redirect allowlist to the deployed APP_URL and local development URL. The default email link supports PKCE `code`; a custom signup/confirmation email template may instead send `{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email`.

## Environment

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY (server only; legacy SUPABASE_SERVICE_ROLE_KEY is accepted)
- OWNER_EMAIL=rohin.juneja@berkeley.edu (must agree with the migration's account restriction)
- APP_URL: exact deployed origin, or http://localhost:3417 locally
- MCP_ALLOWED_ORIGINS: optional comma-separated browser origins for MCP callers. Server-to-server clients ordinarily send no Origin.

## Owner app API

GET /api/auth/status returns {configured,ownerEmail,setupRequired,user}. POST /api/auth/signup and /api/auth/login accept {email,password}. Sign-up returns confirmationRequired. POST /api/auth/logout clears the session. POST /api/auth/reset-password accepts {email} and sends an email recovery link. The verified recovery callback redirects to /reset-password and sets a server-only random proof bound to the verified Supabase session, expiring after fifteen minutes. GET status includes recoveryAuthorized. POST /api/auth/update-password accepts {password}, atomically consumes that proof, changes the password, revokes MCP and Health import connections, and signs out all Supabase refresh sessions. A recovery intent query parameter alone cannot authorize a reset: the verified SDK PKCE flow type or verified recovery token type must match. If customizing the separate recovery email template, its token-hash URL must use type=recovery, not type=email. Ordinary sign-in remains email/password; email verification is required on signup, not on every login. All cookie-authenticated mutations require an exact APP_URL Origin. Session refresh is handled in the API Route Handler, which can write response cookies; the frontend does not use a separate Supabase browser client.

GET /api/bootstrap returns owner identity and all current records, including deletion tombstones. PUT /api/records/[collection]/[id] accepts {data,expectedVersion,mutationId}; DELETE accepts {expectedVersion,mutationId}. Expected version zero creates a record. A UUID mutation ID identifies one exact operation, including retries. A stale version returns 409 and the latest record. Reusing a mutation ID with different content returns 409. Each save is atomic and records a previous-version recovery trail. Nutrition template edits increment revision; embedded food snapshots and diary batch snapshots remain unchanged.

The records table stores one JSON aggregate per workout, recipe, batch, diary entry, etc. This preserves atomic set edits and immutable ingredient snapshots while remaining queryable/indexable in Postgres. UI and MCP writes both use collection-specific strict Zod validation and the same save service. SQL RPC uses SECURITY INVOKER, owner RLS, version comparison, a per-owner transaction advisory lock, and a durable mutation ledger. RPC-backed updates and history writes occur in one transaction.

## MCP and OAuth

MCP endpoint: APP_URL/api/mcp (Streamable HTTP, stateless JSON responses). The existing 13 tools are search_foods/get_food/save_food/search_recipes/get_recipe/save_recipe, search_exercises/get_exercise/save_exercise, search_workouts/get_workout/save_workout, and list_locations. Version 1.2.0 adds search_diary/get_diary_entry/log_meal/save_diary_entry/search_batches/get_batch, for 19 tools in total. It cannot query arbitrary SQL or access raw imported Health data. Workout searches support an inclusive local-date range, exercise/title text and saved location; exercise searches also filter by primary or secondary muscle group. MCP annotations distinguish reads from writes; saving a researched food should follow user review in the calling client.

OAuth metadata lives at /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource/api/mcp. The authorization server advertises CIMD (`client_id_metadata_document_supported: true`) and also supports public dynamic registration for clients that still use DCR. It is not restricted to ChatGPT. CIMD plural token_endpoint_auth_methods_supported is intersected with our advertised methods; the legacy singular preference is used only when the plural field is absent. This supports ChatGPT's current document advertising both none and private_key_jwt, while selecting none. Authorization responses include RFC 9207 iss on success and denial, enabling ChatGPT's stable metadata and callback URLs. Clients must support public-client authorization code flow with S256 PKCE and exact resource binding. Client secret and private_key_jwt authentication are not implemented or advertised.

CIMD uses a public HTTPS metadata URL as client_id. Metadata must contain matching client_id, client_name and redirect_uris. It is limited to 64 KiB, JSON, port 443, and a five-second request. The resolver rejects non-public IPv4 addresses, pins its checked address to the TLS connection, and follows no redirects. Metadata caching respects no-store/no-cache and caps max-age at five minutes. IPv6-only metadata hosts are currently unsupported. Redirects are exact matches, using HTTPS or explicit localhost/loopback HTTP. Consent displays both client identity and the actual destination; localhost clients deserve extra care because a local process can claim a publicly hosted client ID.

GET /api/oauth/authorize validates the request and sends the signed-in owner to /oauth/consent?request_id=.... GET /api/oauth/consent returns {clientName,clientId,redirectUri,scope,csrfToken}. POST accepts {requestId,decision,csrfToken} and returns {redirectUrl}. Consent requests expire after ten minutes. A one-use five-minute code binds client ID, redirect, resource, and PKCE challenge. Tokens are random 256-bit opaque values, stored only as SHA-256 digests. Access lasts one hour; refresh tokens rotate with a thirty-day expiry. Reusing a code or refresh token revokes the grant. The database performs consumption and rotation atomically. Connections can be listed/revoked through GET/DELETE /api/oauth/connections; OAuth revocation endpoint is /api/oauth/revoke. Every MCP call checks the token, resource, grant revocation, live owner identity, and tool scope.

Scopes: nutrition:read, nutrition:write, workouts:read and workouts:write. Omitted scope retains the original nutrition-only default. Existing grants remain unchanged; workout permissions need a fresh owner-approved authorization. Nutrition read covers food/recipe lookup and diary/batch lookup; nutrition write covers food/recipe saves and diary logging/editing. The extension adds no OAuth scope. Workouts read covers the exercise library, workout sessions and saved gym lookup; workouts write covers exercise and workout saves, not gym editing. OAuth discovery/register/token/revocation endpoints permit CORS; MCP token calls validate any browser Origin against APP_URL and MCP_ALLOWED_ORIGINS. There is no cookie-authenticated MCP fallback. Durable rate limits apply to authentication and public OAuth entry points.

Workout saves use the same validated/versioned aggregate service as the app. Clients must fetch the complete current workout before editing, retain nested exercise/set IDs and all unmentioned fields, and review conflicts rather than blindly overwriting. New exercise and gym references must resolve to owner records. Existing historical references remain usable even if later archived/deleted. Duplicate nested IDs are rejected. Health/routine associations are preserved, not created by these tools. Partial/null, fractional, per-side, drop/rest-pause and cardio results remain supported. When a retry is behind the current version, the shared idempotency ledger runs before reference preflight so cached acknowledgements are retained. Exercise definition edits do not rewrite old workout snapshots.

Opening `/api/mcp` directly in a browser returns an expected 401 bearer-token challenge. Configure this URL in the AI client's MCP connection settings using OAuth/CIMD; do not paste a secret key or expect the normal app login cookie to authenticate MCP. The app itself is at `/`.

## Diary MCP extension (1.2.0)

The six new tools reuse existing record collections and the mutation ledger; no schema migration is required. `search_diary` filters by `query`, inclusive `dateFrom`/`dateTo`, optional `meal`, and `limit` (default 30, maximum 100). It returns recent entries, macro totals, current versions, and `hasMore`. `get_diary_entry` returns the complete entry plus calculated nutrient totals, preserving `null`, `partial`, and `estimated` information. `search_batches` accepts the same search fields except `meal`; `get_batch` returns the full batch and totals for the entire batch. Archived batches are excluded from search and cannot be newly logged. Creating or editing batches remains in the app; no batch-write tool is exposed.

Before logging, search the target date and meal to avoid duplicating an existing entry, then use `search_foods`/`get_food` or the batch tools to obtain the correct saved source. `log_meal` creates one diary entry containing all supplied foods or one prep portion. `foodVersion` and `batchVersion` mean the source record's top-level `version`, not the embedded food's `revision`. A changed source returns a conflict for review rather than silently selecting new nutrition values.

Example `log_meal` arguments for an approximate 6 fl oz milk portion follow. The UUIDs and version are illustrative: use the actual food ID/version and fresh entry/mutation UUIDs for a new meal.

```json
{
  "id": "10000000-0000-4000-8000-000000000001",
  "date": "2026-10-16",
  "meal": "Breakfast",
  "name": "Milk",
  "estimated": true,
  "mutationId": "20000000-0000-4000-8000-000000000001",
  "source": {
    "kind": "foods",
    "items": [
      {
        "foodId": "30000000-0000-4000-8000-000000000001",
        "foodVersion": 1,
        "quantity": 6,
        "unit": "fl oz"
      }
    ]
  }
}
```

Add more food portions to `source.items` to log a complete meal together. Each item may include a `note`. `date` is the owner's local calendar date; optional `time` is `HH:mm` or empty when unknown. `notes` defaults to empty. Meal categories are `Breakfast`, `Lunch`, `Dinner`, `Snack`, and `Supplements`. `serving` means one full saved nutrition basis; `fl oz` is volume and `oz` is mass. Unsupported volume-to-mass conversions are rejected rather than inventing a density.

For a batch portion, replace `source` with `{"kind":"batch","batchId":"<saved batch UUID>","batchVersion":1,"portion":{"kind":"fraction","fraction":0.2}}` to log one fifth. Alternatively use `"portion":{"kind":"anchor","quantity":4.8,"unit":"oz"}` for an equivalent amount of the saved anchor ingredient, such as dry pasta. Use the actual batch version. The entry retains the whole batch's ingredient quantities and applies the fraction once through its multiplier; never scale both. Logging preserves the food revisions already embedded in the batch, independently of later library changes.

Keep both the entry `id` and `mutationId` unchanged when retrying an identical `log_meal` request. A server-derived request fingerprint lets the mutation ledger return the original saved entry even if a source was subsequently changed or deleted. Reusing the mutation ID for different arguments returns 409. New meals require fresh IDs. The saved response includes full calculated nutrient totals; verify diary creation rather than treating a saved library food as a consumed meal.

For edits, call `get_diary_entry`, then send `save_diary_entry` the complete `data` object as `entry`, its top-level version as `expectedVersion` (at least 1), and a fresh `mutationId`. Preserve `kind`, `batchId`, retained ingredient IDs and their complete food snapshots, plus all unmentioned fields. Existing snapshots cannot be replaced with newer library values. An added/replacement ingredient needs a fresh ingredient UUID and the complete current food from `get_food`. To customize a prep plate, first multiply its ingredient quantities by the existing multiplier, then set `multiplier:1`, `anchorIngredientId:null`, and `portionCustomized:true` before making the plate changes. A stale entry version returns 409; refetch and review instead of overwriting. An identical save retry retains its mutation ID.

Local extension verification on 2026-10-16: 205 tests passed and one opt-in live test was skipped; TypeScript, ESLint, and the production build passed. `src/lib/server/mcp-diary.integration.sql` also passed against Supabase in a rollback-only, owner-authenticated transaction: diary creation, ledger lookup, replay after a changed hydrated source, rejection of changed mutation content and duplicate creation, and a single history version. No test records persisted. These checks verify the implementation; production deployment and the new ChatGPT diary actions remain pending.

The owner confirmed that the existing ChatGPT OAuth connection and a tool call work after **Manage app → Refresh tools** and a new chat. That confirms the previously deployed tools, not this local extension. After the approved deployment, refresh tools again and start a new chat to discover all 19 tools; a new scope grant is unnecessary when the connection already has nutrition read/write permissions.

## Health integration

The owner can import Health Auto Export JSON v2 in Settings or configure two REST automations. Cookie-authenticated GET/POST/DELETE /api/health/connection reads status, creates/replaces a random token (returned only once), or revokes it. Only its SHA-256 hash is persisted. POST /api/health/import requires the dedicated Bearer credential and rechecks the current confirmed owner. POST /api/health/upload requires the owner cookie and exact Origin. Both accept at most 3,000,000 bytes; daily aggregates require the `Automation-Aggregation: days` header (or `X-Santorio-Aggregation: days` for manual uploads).

The parser only retains supported normalized fields, converts explicit units, preserves export calendar dates and paused workout durations, rejects duplicate/ambiguous daily rows, and uses stable workout/measurement IDs. The service validates patches before one service-only import RPC. The RPC acquires the same owner lock as journal edits, rechecks any bearer digest after the lock, merges against current records, and updates version history atomically. Re-imports replace matching data rather than adding it; an unchanged record does not gain a version just for a new receipt timestamp. Absent fields and manual water are retained. Partial heart-rate summaries preserve omitted extrema. Raw payloads are never stored or logged.

The connection table has default-deny RLS and service-only privileges. Token rotation and revocation use the same owner lock, closing the import/revocation race. Password recovery revokes the import token as well as MCP grants. Existing records remain after revocation. A records trigger prevents two workouts/exercises from claiming the same Watch workout, and validates that the referenced import exists. Link validation failures return 422 so the client can repair its draft rather than treating it as a version conflict. MCP preserves these links but cannot create, move or silently remove them. Repeated workouts and routines clear Watch associations.

Daily active energy includes workout activity. Home expenditure uses estimated BMR + daily active energy, without the activity factor or workout calories being added again. Exported resting energy is kept separately for reference. Missing data stays unknown; daily imports are not assumed to cover a complete day. The complete-day Health trend remains deferred for such imports. Existing home label strings and styling are unchanged.

See [phone setup and import guidance](#health-auto-export-setup). Public receiver rollout and actual phone automation delivery must be verified separately from local import tests.

## Verification

Run npm test and npm run build. Security unit tests also reject forged recovery intent, enforce recovery session binding and one-use proof consumption. Security unit tests cover strict record validation, unknown nutrients, canonical units, ingredient conversions, invalid anchors, private metadata addresses, redirect validation, exact Origin, resource/scopes, and a standard PKCE test vector. The rollback-only integration suite in src/lib/server/backend.integration.sql exercises anonymous denial, confirmed-owner RLS, idempotent replay, stale-version conflict, duplicate mutation rejection, code exchange, refresh rotation/replay, and revocation. The owner has now confirmed the existing ChatGPT connection and tool execution. The deployment verification notes below are historical and do not establish deployment of the local diary extension.

Verified on 2026-10-16: 31 backend unit/transport tests pass; the optional live ChatGPT CIMD fetch passes (SANTORIO_LIVE_TESTS=1); rollback-only remote SQL checks pass with no test owner, record, grant, or recovery proof remaining. The Supabase dashboard automatic-RLS trigger's unnecessary anonymous/authenticated EXECUTE privileges were revoked without disabling the event trigger. Server-only OAuth/recovery tables intentionally have RLS enabled with no client policies.

## Initial deployed prototype

Production: https://santorio-gamma.vercel.app (Vercel project Santorio / santorio). MCP endpoint: https://santorio-gamma.vercel.app/api/mcp. Deployment dpl_4NhgXjLff1CXFDEx5xtJoaJ6g8x7 was READY on 2026-10-16. That initial deployment uploaded the local working tree based on commit 3acc039, before the implementation changes were committed.

Verification at that initial deployment: 86 tests passed, one opt-in live CIMD test was skipped in the default suite (previously passed separately); TypeScript, ESLint, diff whitespace checks and production build passed. Public production checks returned 200 for the app, auth status, manifest/icons and OAuth discovery, and 401 with the appropriate challenge for unauthenticated MCP access. Private bootstrap also returned 401 without a session. Signed-in home/profile rendering was observed locally in a second browser tab and on production. Full interactive workout/nutrition acceptance testing remained incomplete because browser control stalled; email password recovery and ChatGPT's full consent/tool-call flow were still pending user-side testing at that point.

Supabase security advisor: server-only OAuth/rate-limit/recovery tables intentionally use default-deny RLS without client policies. Leaked-password screening is not enabled; see https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection for availability and configuration.

## Workout MCP extension

Deployed 2026-10-16 as dpl_85H4cJfU2qz7pmeTEydagK7Sz2zX, READY at the same production origin. MCP server version 1.1.0 provides 13 tools. At that deployment, all 110 default tests passed (one separately opt-in live CIMD test skipped); lint, TypeScript and production build passed. Eighteen new MCP transport tests covered the exercise/workout tools and six added security tests covered scope consent/compatibility. Live rollback-only database checks verified exercise/workout creation, partial/fractional results, versioned update, retry acknowledgement and stale-write rejection; no test records remained. Production OAuth and resource discovery advertised both workout scopes, while unauthenticated GET/POST MCP requests retained the 401 challenge. ChatGPT authorization and tool execution were unverified at that point; the owner subsequently confirmed the connection works after refreshing tools.


## Health Auto Export setup

The receiver is implemented locally; publishing it requires owner approval. Once deployed, open Settings on https://santorio-gamma.vercel.app and create an import token. Copy it directly into Health Auto Export, not into chat. Localhost cannot receive uploads from the phone.

Create two REST API automations using `https://santorio-gamma.vercel.app/api/health/import`, JSON export version 2, and header `Authorization: Bearer <import token>`. JSON uploads use `Content-Type: application/json`.

1. Daily activity: Health Metrics, Active Energy, Apple Exercise Time, Step Count, optionally Basal Energy Burned for reference. Summarize Data ON, Time Grouping Days, Date Range Default (yesterday plus today). Set `Automation-Aggregation: days`. Do not use Since Last Sync for daily totals.
2. Watch workouts: Workouts, Include Workout Metrics ON, Minutes grouping, routes OFF, Date Range Default. Uses the same URL and authorization token.

Run each automation manually and verify its successful receipt in Settings before enabling its schedule. Background delivery can be delayed by iOS; this is not a real-time HealthKit connection. Consult the [official REST automation guide](https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/). Keep exports under 3,000,000 bytes; shorten the range or enable batching if needed. Settings also accepts manual JSON v2 files with daily aggregation. New token creation replaces the old token; revocation stops imports while retaining saved data. Password recovery revokes the token, requiring a fresh connection.

The supplied October 4 export has been imported through the production database RPC: one daily record, two Watch workouts, 93 heart-rate samples. A repeated import produced three unchanged records and no new revisions. Raw export files remain outside the repository. The database rollback checks passed for atomicity, idempotence, token rotation/revocation, private access, manual-value preservation and unique Watch associations. Chrome rendered the signed-in Settings controls, the exact imported October 4 values, both Watch workouts and the strength-session heart-rate chart; automated interaction with its file picker was unreliable, so actual persistence was verified through the shared parser and database RPC. The local HTTP endpoint was also verified with a temporary token: missing authorization and revoked tokens return 401, a valid repeat import returns 200 with three unchanged records, and cookie-only endpoints reject unauthenticated access. The temporary token was revoked after testing. Phone delivery still awaits deployment and configuration.

Migration filenames match the actual Supabase migration versions (MCP apply assigns its execution timestamp). The initial three migrations were renamed without SQL changes to align the existing remote history; Health migrations include narrow owner-helper permission corrections discovered by database tests.

Health validation: 155 tests pass (one opt-in live CIMD test skipped); TypeScript, ESLint and the production build pass. The Supabase security advisor has no new warning-level findings: private server-only tables intentionally have RLS with no client policies, and the pre-existing leaked-password-screening warning remains.
