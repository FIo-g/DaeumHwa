# 다음화 (DaeumHwa) MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project the orchestrator (Opus) dispatches each task to a Haiku implementer through Claude Code Workflows; a Sonnet review runs after all tasks.

**Goal:** Build the 다음화 web app — a story-bible + AI continuity partner for Korean web-novel writers — with all 17 MVP features working locally on Next.js 16 + PostgreSQL.

**Architecture:** Next.js App Router. Server components read through domain services (`src/server/*`, signature `(db, actor, input)`); mutations go through thin server actions (`src/server/actions/*`) returning `ActionResult`. Drizzle ORM over PostgreSQL (PGlite locally/tests, postgres.js when `DATABASE_URL` is set). AI goes through an `AiClient` interface (Anthropic SDK or a deterministic fake). Heavy client work runs in a Comlink Web Worker; drafts are cached in IndexedDB.

**Tech Stack:** Next.js 16.4, React 19.3, TypeScript 5.9, Tailwind 4 + shadcn/ui, Drizzle ORM 0.45 + drizzle-kit 0.31, PGlite 0.5, postgres.js 3.4, Better Auth 1.7, @anthropic-ai/sdk 0.135, zod 4, Inngest 4, comlink, idb, diff (jsdiff 9), fflate, mammoth, cytoscape, date-fns 4, es-hangul 2, Vitest 5, Testing Library, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` (Korean). Section references below (§F7, §4.2 …) point into it.

## Global Constraints

- Package manager pnpm. Node 24. Pinned versions as listed in Task T00; do not add, remove or upgrade packages in any task except T00 (report needs as blockers instead).
- TypeScript strict. No `any` except `PgDatabase<any, …>` in `Db`. Path alias `@/*` → `src/*`.
- All user-facing copy is Korean, short, plain. Code identifiers and comments are English.
- Principle 1 (spec §1.3): AI output never writes to wiki tables directly. Only `src/server/proposals.ts` (on explicit approval) and author-initiated services write wiki rows.
- Every create/update/archive/restore of `wiki_entries`, `facts`, `threads`, `thread_events`, `relations`, `naming_rules`, `style_cards`, and every `chapters.summary` change records a `change_log` row in the same transaction (`recordChange`).
- Wiki-type rows are never hard-deleted; use `archivedAt`. (Schedule items, comments, issues, proposals may be hard-deleted where a task says so.)
- Every service starts with `requireWorkRole(db, workId, actor.userId, minRole)` using the role table in spec §3.3. Non-members get `NOT_FOUND` (never reveal existence).
- Errors: throw `AppError(code, koreanMessage)`; server actions return `ActionResult<T>` and never throw.
- Next.js 16: page/layout `params` and `searchParams` are Promises; `src/proxy.ts` (Next 16's renamed middleware) only forwards the request path in `x-pathname` for the post-login return; auth is checked in layouts/pages/actions.
- Pages or route handlers that trigger AI declare `export const maxDuration = 300`.
- Default AI model `claude-opus-5-5` from `ANTHROPIC_MODEL`; import extraction uses `ANTHROPIC_MODEL_IMPORT ?? ANTHROPIC_MODEL`. Never hardcode a cheaper default.
- Demo mode (no `ANTHROPIC_API_KEY` or `AI_PROVIDER=fake`) must make every screen and flow usable with deterministic fake output.
- Dates shown to users and day boundaries (usage limit, schedule "today") use Asia/Seoul.
- Structured-output zod schemas use only object/array/string/number/integer/boolean/enum/nullable; no min/max/regex/default/optional; dynamic maps are arrays of `{key, value}`.

## Review Focus

1. **Korean IME composition in the editor** — typing Hangul must never duplicate or drop jamo: no programmatic `value` rewrites, highlight recomputation, or autosave-triggered state replacement while `isComposing`. Test added to T18 (`manuscript-editor.test.tsx`: composition events defer `onBodyChange`-driven highlight updates until `compositionend`).
2. **Save failure / offline** — when the server save fails, the local IndexedDB draft must still hold the text and the status must say so; reopening the chapter offers recovery. Test added to T09 (`use-autosave.test.tsx`: failing save → status `'offline'`, `saveDraft` called with latest body).
3. **Guessed IDs across works** — a user who is not a member must get `NOT_FOUND` for any chapter/entry/proposal id of another work. Tests added to T04 (`getChapter` by non-member) and T10 (`approveProposal` by non-member).
4. **KST day boundary** — usage limits and "today" in schedules use Asia/Seoul, not server UTC. Tests added to T02 (`seoulToday` at 15:30Z) and T08 (`getTodayUsage` ignores runs before KST midnight).
5. **Large manuscripts** — 300-chapter imports must split quickly in the worker and upload in ≤50-chapter batches; the daily AI limit pauses (not fails) the job. Tests added to T09 (`splitChapters` 300 chapters < 2 s) and T16 (`appendImportChapters` rejects 51; limit → status `paused`).

---

## Execution Model (orchestrator notes)

- Branch `feat/mvp`. Implementers never commit; the orchestrator commits after each wave passes `pnpm typecheck && pnpm lint && pnpm test`.
- Implementers work in the shared working tree with strict file ownership (each task's **Files** block). They may read any file. If something outside their files blocks them, they report it in `blockers` and do not edit it.
- Implementer commands: tests `pnpm vitest run <paths> --maxWorkers=2`; typecheck `pnpm typecheck 2>&1 | grep -E '<owned paths>' || true` (fix only own errors). No `next build`/`next dev` except in tasks that say so (T00, T01, T03a, T03c, T26).
- Waves (→ = must finish first):
  - W0: T00
  - W1: T01 → (T02 ∥ T03a) → T03b → T03c
  - W2: T04 ∥ T05 ∥ T06 ∥ T07 ∥ T08 ∥ T09 ∥ T12a
  - W3: T10 ∥ T11 ∥ T12 ∥ (T13 → T16) ∥ T14 ∥ T15
  - W4: T17 ∥ (T18 → T19) ∥ T20 ∥ T21 ∥ T22 ∥ T23 ∥ T24 ∥ T25
  - W5: T26 (integration + E2E) ∥ T27 (eval harness)
  - W6: Sonnet review → Haiku fixes → re-verify

## Conventions (also written to `CLAUDE.md`)

- Services: `export async function verbNoun(db: Db, actor: Actor, input: …): Promise<…>`; call `requireWorkRole` first; wrap multi-row writes in `db.transaction(async (tx) => …)` and pass `tx` down as `db`.
- Actions: files `src/server/actions/<feature>.ts` start with `'use server'`, export only async functions named `<verb><Noun>Action(input: unknown)`, parse input with a zod schema declared in the same file, run `withAction((db, actor) => …)`, call `revalidateWork(workId)` after writes, return `ActionResult<T>`.
- Pages: server components; get context with `pageContext()`; wrap service calls with `guardPage(() => …)` (maps `NOT_FOUND` → `notFound()`). Client components only where interaction needs it (`'use client'` at top).
- Client calls to actions go through `runAction(promise, { success?: string })` which toasts errors (sonner) and returns `data | null`.
- UI: shadcn components from `@/components/ui/*`, shared app components from `@/components/app/*`, labels from `@/lib/labels`. Feature components live in `src/components/<feature>/`.
- Tests: colocated `*.test.ts(x)`. Service tests: `const db = await createTestDb()` in `beforeEach`, users/works via `@/test/factories`. Component tests start with `// @vitest-environment jsdom`. AI in tests: pass a `FakeAiClient` (or `setAiClientForTests`).
- No barrel files except `src/lib/korean/index.ts`.

---

## Shared Contracts (produced in Wave 1; every later task consumes these)

```ts
// src/db/client.ts (T01)
export type Db = PgDatabase<any, typeof schema>
export function getDb(): Db                 // lazy singleton on globalThis; PGlite at PGLITE_DATA_DIR ?? '.data/pglite' unless DATABASE_URL
// src/test/db.ts (T01)
export async function createTestDb(): Promise<Db>   // fresh in-memory PGlite + all migrations
// src/test/factories.ts (T01)
export async function createTestUser(db: Db, o?: { name?: string; email?: string }): Promise<{ id: string; name: string; email: string }>
export async function createTestWork(db: Db, ownerId: string, o?: { title?: string; settings?: WorkSettings }): Promise<WorkRow>   // also inserts owner membership
export async function addTestMember(db: Db, workId: string, userId: string, role: Role): Promise<void>
export async function createTestChapter(db: Db, workId: string, o?: { position?: number; title?: string; body?: string; status?: ChapterStatus; publishedOn?: string | null }): Promise<ChapterRow>
export async function createTestEntry(db: Db, workId: string, o: { name: string; kind?: EntryKind; aliases?: string[]; summary?: string }): Promise<EntryRow>
export async function createTestFact(db: Db, workId: string, o: { content: string; entryId?: string | null; status?: FactStatus; sourceChapterId?: string | null; validFromPosition?: number | null; validToPosition?: number | null }): Promise<FactRow>
export async function createTestThread(db: Db, workId: string, o: { title: string; status?: ThreadStatus; plantedChapterId?: string | null; targetChapterPosition?: number | null }): Promise<ThreadRow>
// src/db/types.ts (T01): status unions + const arrays, Row types, Actor, WorkSettings, DEFAULT_WORK_SETTINGS,
//   resolveWorkSettings, ScheduleInput, ExportPayload (exact shapes in Task T01)
// src/lib/proposal-payloads.ts (T01): zod schemas + ProposalPayloadMap + NewProposal + parseProposalPayload
// src/lib/errors.ts, result.ts, dates.ts, tokens.ts, labels.ts, ai-mode.ts, korean/* (T02)
// src/server/session.ts (T03a): getSessionUser, requireUser, requirePageUser
// src/server/access.ts, changes.ts, works.ts, appearances.ts, proposal-store.ts, action-helpers.ts, page-helpers.ts (T03b)
// src/components/app/*, src/lib/client/run-action.ts (T03c)
```

---

### Task T00: Project scaffold, dependencies, tooling, spikes

**Files:**
- Create: Next.js app at repo root (`package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/*`), `components.json`, `src/components/ui/*` (shadcn), `vitest.config.ts`, `playwright.config.ts`, `.prettierrc.json`, `.prettierignore`, `.env.example`, `.env.local` (gitignored), `README.md`, `src/sample.test.ts` (delete at end of task)
- Modify: `.gitignore`
- Temporary (delete before finishing): `src/app/spike/*`, `src/workers/spike.worker.ts`, `e2e/spike.spec.ts`, `src/app/api/spike-db/route.ts`

**Interfaces:**
- Produces: scripts `dev`, `build`, `start`, `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:watch`, `e2e` (`playwright test`), `format` (`prettier --write .`), `db:generate` (`drizzle-kit generate`), `db:migrate` (`tsx src/db/migrate-cli.ts`), `predev` and `prestart` (`pnpm db:migrate`), `eval:continuity` (`tsx eval/run-continuity.ts`). (`db:*` and `eval:*` targets are created by later tasks; scripts may point at not-yet-existing files.)

- [ ] **Step 1: Scaffold.** Run `pnpm create next-app@16.4.2 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --turbopack --no-react-compiler --yes` (if it refuses because of existing files, scaffold into a scratch dir and copy everything except `.git`). Keep `docs/`.
- [ ] **Step 2: Pin TypeScript** `typescript@5.9.3` (devDependency), `@types/node` matching Node 24.
- [ ] **Step 3: Install runtime deps (exact):** `drizzle-orm@0.45.4 @electric-sql/pglite@0.5.10 postgres@3.4.9 better-auth@1.7.10 @anthropic-ai/sdk@0.135.0 zod@4.6.7 inngest@4.24.0 comlink@4.4.2 idb@8.0.4 diff@9.0.0 fflate@0.8.3 mammoth@1.13.0 cytoscape@3.34.4 date-fns@4.4.0 es-hangul@2.4.0`.
- [ ] **Step 4: Install dev deps:** `drizzle-kit@0.31.11 vitest@5.0.5 @vitejs/plugin-react@6.1.2 vite-tsconfig-paths @testing-library/react@16.3.3 @testing-library/dom @testing-library/user-event @testing-library/jest-dom jsdom@30.1.3 @playwright/test@1.64.1 prettier tsx fake-indexeddb` and `@types/cytoscape` only if `cytoscape` ships no types (check `node_modules/cytoscape/package.json` `types`); same check for `diff` (`@types/diff` only if needed).
- [ ] **Step 5: shadcn.** `pnpm dlx shadcn@4.21.5 init` (defaults, neutral base color), then add: `button input textarea label card dialog alert-dialog dropdown-menu select tabs badge sonner table tooltip popover separator scroll-area sheet checkbox alert skeleton switch radio-group slider progress avatar collapsible toggle-group hover-card command`.
- [ ] **Step 6: Config.**
  - `next.config.ts`: `serverExternalPackages: ['@electric-sql/pglite']`, `experimental.serverActions.bodySizeLimit: '4mb'`.
  - `vitest.config.ts`: plugins `tsconfigPaths()`, `react()`; `test.environment 'node'`, `testTimeout 30000`, `hookTimeout 30000`, `pool 'forks'`, `include ['src/**/*.test.{ts,tsx}', 'eval/**/*.test.ts']`, `setupFiles ['src/test/setup.ts']` where `src/test/setup.ts` imports `@testing-library/jest-dom/vitest` (create it).
  - `playwright.config.ts`: `testDir 'e2e'`, chromium only, `webServer { command: 'pnpm e2e:server', url: 'http://localhost:3100', reuseExistingServer: false, timeout: 240000 }`, `use.baseURL 'http://localhost:3100'`; script `e2e:server` = `rm -rf .data/e2e && PGLITE_DATA_DIR=.data/e2e AI_PROVIDER=fake BETTER_AUTH_URL=http://localhost:3100 pnpm db:migrate && PGLITE_DATA_DIR=.data/e2e AI_PROVIDER=fake BETTER_AUTH_URL=http://localhost:3100 next build && PGLITE_DATA_DIR=.data/e2e AI_PROVIDER=fake BETTER_AUTH_URL=http://localhost:3100 next start -p 3100`.
  - `.prettierrc.json`: `{ "semi": false, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }`.
  - `.gitignore` add: `.data/`, `.env*.local`, `playwright-report/`, `test-results/`, `.claude/worktrees/`, `eval/results/`.
  - `.env.example` documents every variable in spec §11 with Korean one-line comments; `.env.local` sets `BETTER_AUTH_SECRET=<random 32+ chars>`, `BETTER_AUTH_URL=http://localhost:3000`, `AI_PROVIDER=fake`.
  - Root layout: `<html lang="ko">`; remove Geist font imports; body font stack `"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif` via Tailwind theme variable.
- [ ] **Step 7: Spike A — PGlite inside Next.** Route `src/app/api/spike-db/route.ts`: module-level lazy PGlite (`.data/spike`) + `drizzle-orm/pglite`, returns `select 1 as ok` as JSON. Verify with `pnpm build && pnpm start` then `curl localhost:3000/api/spike-db` → `{"ok":1}`; also with `pnpm dev` (call the route 5× concurrently). Expected: no "database is locked"/"already open" errors. If it fails in dev, record the error in the report and switch the dev strategy to `@electric-sql/pglite-socket` (install `@electric-sql/pglite-socket@0.2.13`; `dev` script runs `pglite-server --db=.data/pglite --port=5433` alongside `next dev`; set `DATABASE_URL=postgres://postgres@localhost:5433/postgres` in `.env.local`) and re-verify.
- [ ] **Step 8: Spike B — Web Worker + Comlink + mammoth under Turbopack.** `src/workers/spike.worker.ts` exposes `ping(): string` returning `'pong:' + typeof mammoth.extractRawText` via Comlink; page `src/app/spike/page.tsx` (client) creates `new Worker(new URL('../../workers/spike.worker.ts', import.meta.url), { type: 'module' })` and renders the result in `<p data-testid="spike">`. `e2e/spike.spec.ts` expects text `pong:function`. Run `pnpm exec playwright install chromium` then a one-off `pnpm build && pnpm start` + `pnpm exec playwright test e2e/spike.spec.ts` against port 3000 (override baseURL via env). If Turbopack cannot bundle the worker, try `next build --webpack` / `next dev --webpack`, and if that works set the `dev`/`build` scripts to use `--webpack`; record which mode is required.
- [ ] **Step 9: Sanity test** `src/sample.test.ts` (`expect(1 + 1).toBe(2)`); run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` — all pass. Then delete spike files and `src/sample.test.ts`, re-run `pnpm lint && pnpm typecheck`.
- [ ] **Step 10: Report** the exact versions installed, which dev DB strategy and bundler mode were chosen, and anything that deviated.

---

### Task T01: Database schema, client, migrations, test helpers, Better Auth config

**Files:**
- Create: `src/db/schema.ts`, `src/db/auth-schema.ts`, `src/db/types.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `src/db/migrate-cli.ts`, `drizzle.config.ts`, `drizzle/*` (generated), `src/lib/auth.ts`, `src/lib/proposal-payloads.ts`, `src/lib/errors.ts`, `src/lib/result.ts`, `src/test/db.ts`, `src/test/factories.ts`, `src/db/schema.test.ts`, `src/lib/proposal-payloads.test.ts`, `src/lib/result.test.ts`

**Interfaces:**
- Produces: everything listed under Shared Contracts for `src/db/*`, `src/test/*`, `src/lib/proposal-payloads.ts`, plus `export const auth` (Better Auth instance) from `src/lib/auth.ts`, plus `src/lib/errors.ts` and `src/lib/result.ts` exactly as specified in Task T02's Interfaces (moved here so T02 and T03a can run in parallel after T01).
- Note: `getDb()` must `mkdirSync(dataDir, { recursive: true })` before creating a file-backed PGlite (PGlite does not create parent dirs).

- [ ] **Step 1: `src/db/types.ts`** — const arrays + unions (exact values):
  `ROLES ['owner','editor','commenter','viewer']`, `ENTRY_KINDS ['character','place','organization','item','rule','event','term','other']`, `FACT_STATUSES ['confirmed','assumed','undecided']`, `FACT_SOURCE_TYPES ['chapter','interview','author','import']`, `THREAD_STATUSES ['planned','planted','developing','resolved','discarded']`, `THREAD_EVENT_KINDS ['planted','developed','resolved','discarded','note']`, `IMPORTANCE ['low','medium','high']`, `PROPOSER_TYPES ['ai','author']`, `PROPOSAL_TYPES ['entry_create','entry_update','fact_create','thread_create','thread_event','relation_create','chapter_summary','style_card']`, `PROPOSAL_SOURCES ['interview','import','post_chapter','style','manual']`, `PROPOSAL_STATUSES ['pending','approved','rejected']`, `CHANGE_ACTIONS ['create','update','archive','restore','revert']`, `CHANGE_TARGETS ['wiki_entries','facts','threads','thread_events','relations','naming_rules','style_cards','chapters']`, `ISSUE_KINDS ['contradiction','naming','timeline','thread','character','other']`, `SEVERITIES ['high','medium','low']`, `ISSUE_STATUSES ['open','accepted','dismissed','wiki_updated']`, `CHAPTER_STATUSES ['draft','done']`, `VERSION_SOURCES ['save','restore','import','ai_draft']`, `IMPORT_STATUSES ['uploading','queued','running','paused','done','error','cancelled']`, `SCHEDULE_KINDS ['deadline','publish','hiatus','event']`, `AI_TASKS ['interview-question','interview-extract','chapter-extract','continuity-check','proofread','reader-sim','direction-advice','draft-chapter','style-suggest']`, `AI_RUN_STATUSES ['running','done','error']`; type names `Role, EntryKind, FactStatus, FactSourceType, ThreadStatus, ThreadEventKind, Importance, ProposerType, ProposalType, ProposalSource, ProposalStatus, ChangeAction, ChangeTargetTable, IssueKind, Severity, IssueStatus, ChapterStatus, VersionSource, ImportJobStatus, ScheduleKind, AiTaskName, AiRunStatus`.
  `export type Actor = { userId: string }`.
  `export interface WorkSettings { absenceThreshold?: number; publishDays?: number[]; chaptersPerPublishDay?: number; bufferTarget?: number; targetChars?: number }`, `DEFAULT_WORK_SETTINGS = { absenceThreshold: 10, publishDays: [1,2,3,4,5], chaptersPerPublishDay: 1, bufferTarget: 5, targetChars: 5500 }`, `resolveWorkSettings(s?: WorkSettings | null): Required<WorkSettings>`.
  Row types via `$inferSelect`: `WorkRow, MemberRow, InviteRow, ChapterRow, ChapterVersionRow, EntryRow, AppearanceRow, FactRow, ThreadRow, ThreadEventRow, RelationRow, NamingRuleRow, StyleCardRow, ProposalRow, ChangeRow, IssueRow, CommentRow, InterviewSessionRow, InterviewTurnRow, ImportJobRow, ScheduleItemRow, AiRunRow, UserWorkStateRow`.
  `ScheduleInput = { settings: Required<WorkSettings>; chapters: { id: string; position: number; title: string; status: ChapterStatus; publishedOn: string | null }[]; items: { id: string; kind: ScheduleKind; title: string; date: string; endDate: string | null; done: boolean }[] }`.
  `ExportPayload = { format: 'daeumhwa-backup'; version: 1; exportedAt: string; work: WorkRow; chapters: ChapterRow[]; entries: EntryRow[]; facts: FactRow[]; threads: ThreadRow[]; threadEvents: ThreadEventRow[]; threadEntries: { threadId: string; entryId: string }[]; relations: RelationRow[]; namingRules: NamingRuleRow[]; styleCards: StyleCardRow[]; changes: ChangeRow[]; scheduleItems: ScheduleItemRow[] }` (timestamps may arrive as ISO strings after JSON).
- [ ] **Step 2: `src/db/auth-schema.ts`** — Better Auth core tables for Drizzle/pg (`user`, `session`, `account`, `verification`). Generate with `pnpm dlx @better-auth/cli@latest generate --config src/lib/auth.ts --output src/db/auth-schema.ts --yes` after Step 4; if the CLI cannot run, hand-write them from `node_modules/better-auth` docs/types (text ids, `user.email` unique, `session.token` unique, cascades on `userId`).
- [ ] **Step 3: `src/db/schema.ts`** — every table and column in spec §4.2 with these exact table names: `works, work_members, work_invites, chapters, chapter_versions, wiki_entries, entry_appearances, facts, threads, thread_entries, thread_events, relations, naming_rules, style_cards, proposals, change_log, issues, comments, interview_sessions, interview_turns, import_jobs, schedule_items, ai_runs, user_work_state`; exported Drizzle objects camelCase plural (`works, workMembers, workInvites, chapters, chapterVersions, wikiEntries, entryAppearances, facts, threads, threadEntries, threadEvents, relations, namingRules, styleCards, proposals, changeLog, issues, comments, interviewSessions, interviewTurns, importJobs, scheduleItems, aiRuns, userWorkState`). Rules: uuid PK `.defaultRandom()`; user FKs are `text` → `user.id`; `work_id` FKs cascade on delete; nullable chapter/entry/fact refs `onDelete: 'set null'`; status/kind columns `text().$type<Union>()` with the defaults in spec §4.2; `aliases`, `variants` = `text().array().notNull().default(sql\`'{}'::text[]\`)`; `import_jobs.chapter_ids` = `uuid().array().notNull()`; `date` columns `{ mode: 'string' }`; jsonb columns typed with `$type<…>()` (`works.settings: WorkSettings`, `wiki_entries.fields: Record<string,string>`, `wiki_entries.custom_fields: {key:string;value:string}[]`, `import_jobs.state: { knownEntities: { name: string; kind: EntryKind; aliases: string[] }[]; threadTitles: string[] }`, `change_log.before/after: unknown`, `proposals.payload: unknown`, `ai_runs.output: unknown`). Facts include `validFromPosition`, `validToPosition` (integer, nullable), `supersededByFactId` (uuid, nullable, no FK). Indexes as in spec §4.2 (`chapters(work_id, position)`, `chapter_versions(chapter_id, version)`, `wiki_entries(work_id, kind)`, `facts(work_id)`, `facts(entry_id)`, `proposals(work_id, status)`, `change_log(work_id, created_at)`, `change_log(target_table, target_id)`, `issues(chapter_id, status)`, `ai_runs(user_id, created_at)`). End the file with `export * from './auth-schema'`.
- [ ] **Step 4: `src/lib/auth.ts`** — `export const auth = betterAuth({ database: drizzleAdapter(getDb(), { provider: 'pg', schema: { user, session, account, verification } }), emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true }, plugins: [nextCookies()] })` (secret/baseURL from env). Confirm import paths against `node_modules/better-auth`.
- [ ] **Step 5: `src/db/client.ts`** — `getDb(): Db` memoized on `globalThis.__daeumhwaDb`; if `process.env.DATABASE_URL` → `drizzle(postgres(url, { prepare: false, max: 5 }), { schema })` (postgres-js driver); else `new PGlite(process.env.PGLITE_DATA_DIR ?? '.data/pglite')` + `drizzle-orm/pglite`. Export `type Db = PgDatabase<any, typeof schema>` and `function getDriverKind(): 'pglite' | 'postgres'`. Follow T00's report if it switched dev to pglite-socket (then dev always has `DATABASE_URL`).
- [ ] **Step 6: Migrations.** `drizzle.config.ts` (dialect `postgresql`, schema `./src/db/schema.ts`, out `./drizzle`). Run `pnpm db:generate` → commit-ready SQL in `drizzle/`. `src/db/migrate.ts`: `export async function migrateDb(db: Db, kind: 'pglite' | 'postgres'): Promise<void>` using the matching drizzle migrator with `migrationsFolder: path.resolve(process.cwd(), 'drizzle')`. `src/db/migrate-cli.ts`: migrates `getDb()`, prints `마이그레이션 완료`, exits (closes the connection/PGlite).
- [ ] **Step 7: `src/lib/proposal-payloads.ts`** — zod schemas exactly as spec §4.2 proposals list (fields and nullability verbatim; `fact_create` includes `supersedesFactId: string | null`; `thread_create.events: { kind: 'developed'|'resolved'; chapterId: string; evidence: string }[]`; `relation_create.directed: boolean`), `PROPOSAL_PAYLOAD_SCHEMAS`, `type ProposalPayloadMap`, `type NewProposal = { [K in ProposalType]: { type: K; payload: ProposalPayloadMap[K]; source: ProposalSource; sourceRef: string | null; chapterId: string | null } }[ProposalType]`, `parseProposalPayload<K extends ProposalType>(type: K, payload: unknown): ProposalPayloadMap[K]` (throws `AppError('VALIDATION', '제안 내용 형식이 올바르지 않습니다.')` from `@/lib/errors`, which this task creates). Also create `src/lib/errors.ts` and `src/lib/result.ts` per T02's Interfaces and the `result.test.ts` cases listed in T02 Step 1.
- [ ] **Step 8: Test helpers.** `src/test/db.ts` `createTestDb()` (in-memory `new PGlite()`, drizzle, `migrateDb(db,'pglite')`); `src/test/factories.ts` per Shared Contracts (direct inserts; `createTestUser` inserts into `user` with unique email `user-<n>@test.local`).
- [ ] **Step 9: Tests** `src/db/schema.test.ts`:
  - `migrations create all tables` — query `information_schema.tables` contains all 24 domain table names + `user`.
  - `uuid and defaults` — inserted work has uuid id, `status === 'active'`, `settings` `{}`.
  - `arrays and jsonb round-trip` — entry `aliases ['서윤','윤이']`, `fields { age: '17' }` read back equal.
  - `deleting a work cascades` — chapter/entry/fact rows of that work are gone.
  - `set null on chapter delete` — fact `sourceChapterId` becomes null.
  `src/lib/proposal-payloads.test.ts`: valid `fact_create` parses; missing `supersedesFactId` throws `AppError` code `VALIDATION`.
- [ ] **Step 10: Verify** `pnpm vitest run src/db src/lib/proposal-payloads.test.ts --maxWorkers=2` passes; `pnpm db:migrate` succeeds on a fresh `.data/pglite`.

---

### Task T02: Core utilities and Korean text library (pure)

**Files:**
- Create: `src/lib/dates.ts`, `src/lib/tokens.ts`, `src/lib/labels.ts`, `src/lib/ai-mode.ts`, `src/lib/korean/{chars,josa,mentions,sentences,naming,spelling-rules,index}.ts` + tests `src/lib/{dates,tokens}.test.ts`, `src/lib/korean/*.test.ts`
- (`src/lib/errors.ts`, `src/lib/result.ts` and `result.test.ts` are created by T01 from the specs below.)

**Interfaces:**
- Produces:
  - `errors.ts` (built in T01): `type ErrorCode = 'NOT_FOUND'|'FORBIDDEN'|'CONFLICT'|'VALIDATION'|'AI_LIMIT'|'AI_ERROR'|'BAD_STATE'|'UNAUTHENTICATED'`; `class AppError extends Error { code: ErrorCode; details?: unknown; constructor(code, message, details?) }`; `isAppError(e): e is AppError`.
  - `result.ts`: `type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } }`; `ok(data)`, `fail(code, message)`; `toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>>` (AppError → its code/message; ZodError → `VALIDATION` `'입력값이 올바르지 않습니다.'`; Next.js redirect/notFound errors are rethrown — detect with `isRedirectError`/`unstable_rethrow` from `next/navigation` or check `digest`; anything else → `BAD_STATE` `'알 수 없는 오류가 발생했습니다.'` + `console.error`).
  - `dates.ts`: `seoulToday(now = new Date()): string`, `seoulDayStart(now = new Date()): Date`, `addDays(date: string, n: number): string`, `dayOfWeek(date: string): number` (0=Sun), `daysBetween(from: string, to: string): number`, `toIsoString(v: Date | string | null | undefined): string | null`, `formatKoreanDateTime(v: Date | string): string` (`'2026. 10. 16. 14:05'`, Asia/Seoul), `formatKoreanDate(date: string): string` (`'10월 16일 (금)'`).
  - `tokens.ts`: `randomToken(bytes = 32): string` (base64url, `crypto.getRandomValues`).
  - `ai-mode.ts`: `isDemoMode(): boolean` — `AI_PROVIDER==='fake'` → true; `'anthropic'` → false; otherwise `!process.env.ANTHROPIC_API_KEY`.
  - `labels.ts`: `ENTRY_KIND_LABEL`, `FACT_STATUS_LABEL`, `SOURCE_TYPE_LABEL`, `THREAD_STATUS_LABEL`, `THREAD_EVENT_LABEL`, `IMPORTANCE_LABEL`, `ROLE_LABEL`, `ISSUE_KIND_LABEL`, `SEVERITY_LABEL`, `ISSUE_STATUS_LABEL`, `PROPOSAL_TYPE_LABEL`, `PROPOSAL_SOURCE_LABEL`, `CHAPTER_STATUS_LABEL`, `SCHEDULE_KIND_LABEL`, `CHARACTER_FIELD_LABELS` (`role 역할, age 나이, gender 성별, appearance 외모, personality 성격, speech 말투, goal 목표, background 배경`), `PLACE_FIELD_LABELS` (`location 위치, features 특징`), `chapterLabel(position: number, title?: string | null): string`. Values: entry kinds `인물/장소/조직/물건/규칙/사건/용어/기타`; facts `확정/가정/미정`; source types `회차/인터뷰/작가 입력/가져오기`; thread status `계획됨/심음/발전 중/회수/폐기`; thread events `심음/발전/회수/폐기/메모`; importance `낮음/보통/높음`; roles `소유자/편집자/코멘트 작성자/보기 전용`; issue kinds `설정 충돌/표기 불일치/시간선/떡밥/인물/기타`; severity `높음/보통/낮음`; issue status `확인 필요/고침/무시/위키 수정`; proposal types `새 카드/카드 수정/새 사실/새 떡밥/떡밥 기록/새 관계/회차 요약/문체 카드`; proposal sources `인터뷰/원고 가져오기/회차 점검/문체 제안/직접 입력`; chapter status `초안/완료`; schedule kinds `마감/연재/휴재/기타 일정`.
  - `korean/chars.ts`: `countChars(text: string): { withSpaces: number; withoutSpaces: number }` (code points; withSpaces excludes `\r` `\n`; withoutSpaces excludes all `\s`).
  - `korean/josa.ts`: `JOSA: readonly string[]`, `hasJongseong(ch: string): boolean`, `jongseongIndex(ch: string): number` (−1 if not a Hangul syllable), `stripJosa(word: string): string` (strip up to two trailing particle tokens, longest first, only while ≥2 chars remain; a lone `이` after a jongseong syllable counts as a token).
  - `korean/mentions.ts`: `type MentionTarget = { id: string; names: string[] }`, `type Mention = { entryId: string; count: number; firstIndex: number; positions: number[] }`, `findMentions(text: string, targets: MentionTarget[]): Mention[]` sorted by count desc then firstIndex.
  - `korean/sentences.ts`: `splitSentences(text: string): { text: string; start: number; end: number }[]`, `locateQuote(text: string, quote: string, hint?: number): { start: number; end: number } | null`, `sentenceAt(text: string, index: number): { text: string; start: number; end: number }`.
  - `korean/naming.ts`: `type NamingIssueHit = { ruleId: string; variant: string; canonical: string; start: number; end: number; sentence: string }`, `findNamingIssues(text: string, rules: { id: string; canonical: string; variants: string[] }[]): NamingIssueHit[]`.
  - `korean/spelling-rules.ts`: `type SpellingRule = { id: string; pattern: RegExp; replace: (match: RegExpExecArray) => string; reason: string }`, `SPELLING_RULES: SpellingRule[]`, `type RuleSuggestion = { ruleId: string; quote: string; replacement: string; reason: string; start: number; end: number }`, `ruleBasedSpellcheck(text: string): RuleSuggestion[]` (sorted by start, non-overlapping).
  - `korean/index.ts` re-exports all korean modules.

- [ ] **Step 1: Write tests first** (exact cases):
  - `dates.test.ts`: `seoulToday(new Date('2026-10-16T15:30:00Z')) === '2026-10-17'`; `seoulToday(new Date('2026-10-16T14:59:59Z')) === '2026-10-16'`; `seoulDayStart(new Date('2026-10-16T15:30:00Z')).toISOString() === '2026-10-16T15:00:00.000Z'`; `addDays('2026-12-31', 1) === '2027-01-01'`; `dayOfWeek('2026-10-16') === 5`; `dayOfWeek('2026-10-18') === 0`; `daysBetween('2026-10-16','2026-10-19') === 3`; `formatKoreanDate('2026-10-16') === '10월 16일 (금)'`.
  - `result.test.ts` (written in T01): AppError → `{ ok:false, error:{ code:'CONFLICT', message } }`; ZodError → `VALIDATION`; generic Error → `BAD_STATE`.
  - `chars.test.ts`: `countChars('가 나\n다')` → `{ withSpaces: 4, withoutSpaces: 3 }`; `countChars('')` → zeros; `countChars('😀 a')` → `{ withSpaces: 3, withoutSpaces: 2 }`.
  - `josa.test.ts`: `stripJosa('서윤이가') === '서윤'`, `stripJosa('민준의') === '민준'`, `stripJosa('세계관은') === '세계관'`, `stripJosa('수이') === '수이'`, `stripJosa('나리') === '나리'`, `stripJosa('왕국에서는') === '왕국'`; `hasJongseong('준') === true`, `hasJongseong('서') === false`.
  - `mentions.test.ts`: targets `[{id:'a',names:['이서윤','서윤']},{id:'b',names:['민준']},{id:'c',names:['강']}]`, text `'이서윤이 웃었다. 서윤아, 민준이가 불렀다. 민준호는 모른다. 김민준은 왔다. (민준) 강은 흘렀다.'` → a.count 2, b.count 2 (`민준이가`, `(민준)`; not `민준호`, not `김민준`), c absent (single-char names ignored); firstIndex of a = 0.
  - `sentences.test.ts`: `splitSentences('그가 말했다. "정말?" 그녀는 웃었다…\n다음 줄')` texts `['그가 말했다.', '"정말?"', '그녀는 웃었다…', '다음 줄']` with `start` values `[0, 7, 14, 23]`; `locateQuote('가나다 라마바','나다 라마')` → `{start:1,end:6}`; `locateQuote('가나다  라마','나다 라마')` → `{start:1,end:7}`; `locateQuote('가나다','없음') === null`.
  - `naming.test.ts`: rules `[{id:'r1',canonical:'레이아',variants:['레이야']}]`, text `'레이야가 왔다. 레이아는 갔다. 플레이야말로.'` → exactly one hit `{ variant:'레이야', canonical:'레이아', start:0, end:3, sentence:'레이야가 왔다.' }`.
  - `spelling-rules.test.ts`: each row below: `ruleBasedSpellcheck(input)` contains a suggestion whose `quote`→`replacement` turns the input into the expected output, and `ruleBasedSpellcheck('되도록 빨리 왔다.')` and `ruleBasedSpellcheck('왠지 이상했다.')` return `[]`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib --maxWorkers=2` → FAIL (modules missing).
- [ ] **Step 3: Implement.** Mention rule (algorithm the tests do not fully pin): for each name (trimmed, length ≥ 2), longest names first, scan occurrences; accept an occurrence only if the previous char is not `[가-힣A-Za-z0-9]`, and the remaining run of Hangul after the name (until a non-Hangul char) is empty, a vocative `아`/`야`, or decomposes into ≤3 tokens from `JOSA` (optionally starting with `이` when the name ends with a jongseong). Overlapping occurrences claimed by a longer name are not re-counted. `JOSA` must include at least: `은 는 이 가 을 를 의 에 에게 에게서 에서 와 과 로 으로 도 만 께 께서 한테 한테서 랑 이랑 나 이나 야 아 여 이여 부터 까지 처럼 보다 조차 마저 라도 이라도 만큼 뿐 밖에 요 이요 이며 며 하고 들 이다 이었다 였다 이야 입니다 이에요 예요 이지 이고`. Sentence boundary: after `.`, `!`, `?`, `…` (plus any immediately following closing quotes/brackets `" ' ” ’ 」 』 )`), and at line breaks; trim whitespace; skip empty. `locateQuote`: exact `indexOf` (prefer the occurrence nearest `hint`), else collapse runs of whitespace in both and map indices back to the original.
  Spelling rules (id, pattern → replacement, reason) — implement exactly these 30:
  | id | input → expected |
  |---|---|
  | `doeyo` | `안 되요.` → `안 돼요.` (되요→돼요, "'되어요'의 준말은 '돼요'입니다.") |
  | `dwaet` | `잘 됬다.` → `잘 됐다.` |
  | `doeseo` | `되서 기뻤다.` → `돼서 기뻤다.` |
  | `doedo` | `늦어도 되도 괜찮아.` → `늦어도 돼도 괜찮아.` (not before `록`) |
  | `andwae` | `그건 안돼.` → `그건 안 돼.` |
  | `anhdoe` | `그러면 않되.` → `그러면 안 돼.` |
  | `anhdwae` | `그러면 않돼.` → `그러면 안 돼.` |
  | `wenman` | `왠만하면 와.` → `웬만하면 와.` |
  | `wenji` | `웬지 슬펐다.` → `왠지 슬펐다.` |
  | `wen` | `왠 사람이야?` → `웬 사람이야?` (`왠` not followed by `지`) |
  | `wenil` | `왠일이야.` → `웬일이야.` |
  | `myeochil` | `몇일 뒤에.` / `몇 일 뒤에.` → `며칠 뒤에.` |
  | `eotteokhae` | `어떻해!` → `어떡해!` ; `어떻하지` → `어떡하지` |
  | `geumse` | `금새 사라졌다.` → `금세 사라졌다.` |
  | `oraenman` | `오랫만이야.` → `오랜만이야.` |
  | `heehan` | `희안하네.` → `희한하네.` |
  | `seolgeoji` | `설겆이를 했다.` → `설거지를 했다.` |
  | `yeokhal` | `역활을 맡았다.` → `역할을 맡았다.` |
  | `lge` | `내가 할께.` → `내가 할게.` (any ㄹ-jongseong syllable + `께` at word end) |
  | `lgeol` | `말할껄.` → `말할걸.` |
  | `eoi` | `어의없다.` → `어이없다.` |
  | `guji` | `구지 왜?` → `굳이 왜?` |
  | `hallyeogo` | `할려고 했다.` → `하려고 했다.` |
  | `geonne` | `물을 건냈다.` → `물을 건넸다.` (건내→건네) |
  | `kkaekkeusi` | `깨끗히 씻어.` → `깨끗이 씻어.` |
  | `teumteumi` | `틈틈히 읽었다.` → `틈틈이 읽었다.` |
  | `ilili` | `일일히 셌다.` → `일일이 셌다.` |
  | `seolleom` | `설레임이 컸다.` → `설렘이 컸다.` |
  | `geoyeyo` | `그건 내 거에요.` → `그건 내 거예요.` |
  | `ieot` | `학생이였다.` → `학생이었다.` |
- [ ] **Step 4: Run** the same command → PASS. Typecheck own files.

---

### Task T03a: Authentication routes, session helpers, auth pages

**Files:**
- Create: `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`, `src/server/session.ts`, `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/components/auth/auth-form.tsx`
- Modify: `src/app/page.tsx` (root → redirect)

**Interfaces:**
- Consumes: `auth` (T01), `AppError` (T02).
- Produces: `src/server/session.ts`: `type SessionUser = { id: string; name: string; email: string }`; `getSessionUser(): Promise<SessionUser | null>` (`auth.api.getSession({ headers: await headers() })`); `requireUser(): Promise<SessionUser>` (throws `AppError('UNAUTHENTICATED','로그인이 필요합니다.')`); `requirePageUser(nextPath?: string): Promise<SessionUser>` (redirects to `/login?next=<encoded>`). `src/lib/auth-client.ts`: `export const authClient = createAuthClient()` from `better-auth/react`.

- [ ] **Step 1:** Route handler `export const { GET, POST } = toNextJsHandler(auth)` (path per `better-auth/next-js`).
- [ ] **Step 2:** `AuthForm({ mode: 'login' | 'signup' })` client component: fields 이름 (signup only), 이메일, 비밀번호 (8자 이상); submit via `authClient.signUp.email` / `authClient.signIn.email`; on success `router.replace(next ?? '/works')` + `router.refresh()`; error copy: login failure `'이메일 또는 비밀번호가 맞지 않습니다.'`, signup duplicate `'이미 가입된 이메일입니다.'`, other `'잠시 후 다시 시도해 주세요.'`. Links between pages: `'계정이 없나요? 가입하기'`, `'이미 계정이 있나요? 로그인'`. Title on both pages: `다음화`, subtitle `설정과 떡밥을 기억하는 웹소설 연재 파트너`.
- [ ] **Step 3:** `(auth)/layout.tsx` centers a card; if already signed in → redirect `/works`. Root `src/app/page.tsx`: signed in → `/works`, else `/login`.
- [ ] **Step 4: Verify (manual, sequential task):** `pnpm build && pnpm start`; with curl: POST `/api/auth/sign-up/email` `{name,email,password}` → 200 and `set-cookie`; GET `/` with that cookie → 307 to `/works`. Report the commands and outcomes. `pnpm lint && pnpm typecheck` clean.

---

### Task T03b: Access control, change log, works service, appearances, proposal store, action/page helpers

**Files:**
- Create: `src/server/access.ts`, `src/server/changes.ts`, `src/server/works.ts`, `src/server/appearances.ts`, `src/server/proposal-store.ts`, `src/server/action-helpers.ts`, `src/server/page-helpers.ts`, `src/server/actions/works.ts`, tests `src/server/{access,changes,works,appearances,proposal-store}.test.ts`

**Interfaces:**
- Consumes: T01, T02, `requireUser`/`requirePageUser` (T03a).
- Produces:
  - `access.ts`: `ROLE_RANK: Record<Role, number>` (`viewer 0, commenter 1, editor 2, owner 3`); `hasRole(role: Role, min: Role): boolean`; `getMembership(db, workId, userId): Promise<{ role: Role } | null>`; `requireWorkRole(db: Db, workId: string, userId: string, min: Role): Promise<{ role: Role }>` — work missing/archived-irrelevant or not a member → `AppError('NOT_FOUND','작품을 찾을 수 없습니다.')`; rank too low → `AppError('FORBIDDEN','이 작업을 할 권한이 없습니다.')`. `requireRowWork(db, table: 'chapters'|'wiki_entries'|'facts'|'threads'|'thread_events'|'relations'|'naming_rules'|'style_cards'|'proposals'|'issues'|'comments'|'change_log'|'import_jobs'|'schedule_items'|'interview_sessions'|'interview_turns'|'work_invites', id: string): Promise<string>` → returns the row's `workId` (for `thread_events`/`interview_turns` via parent) or throws `NOT_FOUND` `'항목을 찾을 수 없습니다.'`.
  - `changes.ts`: `type RecordChangeInput = { workId: string; targetTable: ChangeTargetTable; targetId: string; action: ChangeAction; before: unknown | null; after: unknown | null; proposerType: ProposerType; actorId: string | null; proposalId?: string | null; revertsChangeId?: string | null; summary: string }`; `recordChange(db, input): Promise<ChangeRow>`; `listChanges(db, actor, workId, f?: { targetTable?: ChangeTargetTable; targetId?: string; proposerType?: ProposerType; limit?: number; beforeId?: string /* keyset cursor: id of the last row of the previous page, compared on (created_at, id) */ }): Promise<(ChangeRow & { actorName: string | null })[]>` (viewer, newest first, default limit 50); `revertChange(db, actor, changeId: string): Promise<ChangeRow>` (editor).
  - `works.ts`: `createWork(db, actor, input: { title: string; genre?: string; logline?: string; synopsis?: string }): Promise<WorkRow>`; `listMyWorks(db, actor, o?: { includeArchived?: boolean }): Promise<(WorkRow & { role: Role })[]>` (updatedAt desc); `getWork(db, actor, workId): Promise<WorkRow & { role: Role }>`; `updateWork(db, actor, workId, patch: { title?: string; genre?: string; logline?: string; synopsis?: string; settings?: WorkSettings }): Promise<WorkRow>` (owner; settings shallow-merged); `setWorkArchived(db, actor, workId, archived: boolean): Promise<WorkRow>` (owner).
  - `appearances.ts`: `recomputeAppearances(db, chapterId: string): Promise<void>`; `recomputeAppearancesForEntry(db, entryId: string): Promise<void>`; `getEntryAppearances(db, entryId): Promise<{ chapterId: string; position: number; title: string; mentionCount: number }[]>` (position asc); `getFirstAppearances(db, workId): Promise<Map<string, number>>` (entryId → min position).
  - `proposal-store.ts`: `insertProposals(db, workId: string, items: NewProposal[]): Promise<ProposalRow[]>` (validates each payload with `parseProposalPayload`); `deletePendingProposals(db, where: { workId: string; source: ProposalSource; chapterId?: string; sourceRef?: string }): Promise<number>`; `countPendingProposals(db, workId): Promise<number>`.
  - `action-helpers.ts`: `withAction<T>(fn: (db: Db, actor: Actor) => Promise<T>): Promise<ActionResult<T>>` (requireUser + getDb + toActionResult); `revalidateWork(workId: string): void` (`revalidatePath('/works/' + workId, 'layout')` and `revalidatePath('/works')`).
  - `page-helpers.ts`: `pageContext(nextPath?: string): Promise<{ db: Db; actor: Actor; user: SessionUser }>`; `guardPage<T>(fn: () => Promise<T>): Promise<T>` (AppError `NOT_FOUND` → `notFound()`; `UNAUTHENTICATED` → redirect `/login`; others rethrow).
  - `actions/works.ts`: `createWorkAction(input: { title; genre?; logline? }): Promise<ActionResult<WorkRow>>`, `updateWorkAction(input: { workId; title?; genre?; logline?; synopsis?; settings? })`, `setWorkArchivedAction(input: { workId; archived: boolean })`.

- [ ] **Step 1: Tests first.**
  - `access.test.ts`: owner passes `editor`; viewer requiring `editor` → `FORBIDDEN`; stranger → `NOT_FOUND`; nonexistent work → `NOT_FOUND`; `requireRowWork(db,'facts',id)` returns workId; unknown id → `NOT_FOUND`.
  - `changes.test.ts`: `revert of create archives the row` (record a create for an entry → revert → entry `archivedAt` set, new change action `revert`, `revertsChangeId` = original); `revert of update restores before` (name '서윤'→'이서윤' recorded → revert → name '서윤'); `revert of archive unarchives`; `revert rejected when a later change exists` → `CONFLICT` with message `'이후 변경이 있어 먼저 그 변경을 되돌려야 합니다.'`; `viewer cannot revert` → `FORBIDDEN`; `listChanges filters by proposerType`.
  - `works.test.ts`: createWork adds owner membership; listMyWorks excludes works of others and archived by default; updateWork merges settings (`{bufferTarget:3}` keeps other keys absent→defaults via resolveWorkSettings); editor cannot updateWork → `FORBIDDEN`.
  - `appearances.test.ts`: entry '이서윤' alias '서윤', chapters 1 ('서윤은 웃었다.') and 2 ('민준이 왔다.') → after `recomputeAppearances` for both, `getEntryAppearances` = `[{position:1, mentionCount:1}]`; renaming alias then `recomputeAppearancesForEntry` updates rows; `getFirstAppearances` returns 1.
  - `proposal-store.test.ts`: insert 2 valid proposals → rows pending; invalid payload → `VALIDATION`; `deletePendingProposals` removes only pending of that source/chapter; `countPendingProposals` = 1 after approving one manually.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. Revert algorithm (not determined by tests alone): look up the latest change for `(targetTable, targetId)`; it must be `changeId`; table map gives the Drizzle table and mutable columns (`wiki_entries: kind,name,aliases,summary,body,fields,customFields,archivedAt`; `facts: entryId,subjectName,content,status,sourceType,sourceChapterId,evidence,validFromPosition,validToPosition,supersededByFactId,archivedAt`; `threads: title,description,status,plantedChapterId,resolvedChapterId,targetChapterPosition,importance,archivedAt` (+ restore `thread_entries` from `before.relatedEntryIds` when present); `thread_events: kind,chapterId,note,evidence,archivedAt`; `relations: kind,description,directed,startPosition,endPosition,sourceEntryId,targetEntryId,archivedAt`; `naming_rules: canonical,variants,note,entryId,archivedAt`; `style_cards: entryId,name,tone,rules,examples,archivedAt`; `chapters: summary`). If `before === null` → set `archivedAt = now`; else set each mutable column from `before` (convert `archivedAt` ISO string → Date). Record the new change (`action 'revert'`, `before` = current row, `after` = new row, `proposerType 'author'`, summary `'되돌리기: ' + original.summary`). For `thread_events` reverts also re-derive nothing (thread status is restored by reverting the thread change separately).
- [ ] **Step 4:** run → PASS; typecheck own files.

---

### Task T03c: App shell, shared app components, works list (basic), new work, work layout

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/works/page.tsx`, `src/app/(app)/works/new/page.tsx`, `src/app/(app)/works/[workId]/layout.tsx`, `src/app/(app)/works/[workId]/page.tsx` (placeholder; T17 replaces), `src/components/app/{top-bar,work-sidebar,page-header,empty-state,fact-status-badge,fact-status-select,source-label,ai-badge,demo-banner,confirm-button,submit-button,chapter-picker}.tsx`, `src/components/works/new-work-form.tsx`, `src/lib/client/run-action.ts`
- Modify: `src/app/layout.tsx` (add `<Toaster />`, metadata title `다음화`)

**Interfaces:**
- Consumes: T03a session, T03b works/proposal-store/page-helpers/actions, T02 labels/ai-mode.
- Produces (props are exact):
  - `TopBar({ user: SessionUser })` — logo `다음화` → `/works`, user name, `로그아웃` (authClient.signOut → `/login`).
  - `WorkSidebar({ workId: string; workTitle: string; role: Role; pendingCount: number })` — links (Korean labels): `홈 /works/[id]`, `집필 /works/[id]/write`, `회차 /works/[id]/chapters`, `설정 보드 /works/[id]/wiki`, `승인 대기 /works/[id]/approvals` (badge when > 0), `이력 /works/[id]/history`, `일정 /works/[id]/schedule`, `방향 조언 /works/[id]/advice`, `독자 시뮬레이션 /works/[id]/reader-sim`, `작품 설정 /works/[id]/settings`; `가져오기 /works/[id]/import` and `인터뷰 /works/[id]/interview` as secondary links; active link highlighted via `usePathname`.
  - `PageHeader({ title: string; description?: string; actions?: React.ReactNode })`, `EmptyState({ title: string; description?: string; action?: React.ReactNode })`.
  - `FactStatusBadge({ status: FactStatus })` (확정 green, 가정 amber with text `[가정]`, 미정 gray), `FactStatusSelect({ value: FactStatus; onChange: (s: FactStatus) => void; name?: string })` (3-way toggle group).
  - `SourceLabel({ workId: string; sourceType: FactSourceType; chapter: { id: string; position: number; title: string } | null })` → chapter link `chapterLabel(...)` or label text.
  - `AiBadge()` → small badge `AI 제안`. `DemoBanner()` → server component; renders only when `isDemoMode()`: `AI 데모 모드: 실제 AI 대신 예시 결과를 보여 줍니다. ANTHROPIC_API_KEY를 설정하면 실제 AI를 사용합니다.`
  - `ConfirmButton({ title: string; description?: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; children: React.ReactNode; variant?: ButtonProps['variant']; size?: ButtonProps['size']; disabled?: boolean })` (AlertDialog).
  - `SubmitButton({ children, pending?: boolean })`.
  - `ChapterPicker({ chapters: { id: string; position: number; title: string }[]; value: string | null; onChange: (id: string | null) => void; allowNone?: boolean; placeholder?: string })` (Select showing `chapterLabel`).
  - `runAction<T>(p: Promise<ActionResult<T>>, o?: { success?: string }): Promise<T | null>`.
- [ ] **Step 1:** `(app)/layout.tsx`: `requirePageUser()`; render `TopBar`, `DemoBanner`, `{children}`.
- [ ] **Step 2:** `/works` page (basic): `PageHeader('내 작품', actions: '새 작품' → /works/new)`; list of `listMyWorks` cards (title, genre, `최근 수정 …`) linking to `/works/[id]`; `EmptyState('아직 작품이 없습니다', '새 작품을 만들어 설정과 원고를 정리해 보세요.')`.
- [ ] **Step 3:** `/works/new`: `NewWorkForm` (제목 required, 장르, 한 줄 소개) → `createWorkAction` → then a choice step with three buttons: `인터뷰로 설정 정리하기` → `/works/[id]/interview`, `기존 원고 가져오기` → `/works/[id]/import`, `바로 쓰기` → `/works/[id]/write`.
- [ ] **Step 4:** `/works/[workId]/layout.tsx`: `guardPage(getWork)`, `countPendingProposals`; two-column layout with `WorkSidebar` (collapsible to a Sheet on narrow screens). Placeholder home page shows the work title and `준비 중` (T17 replaces).
- [ ] **Step 5: Verify:** `pnpm build` passes; `pnpm start` + sign up through curl as in T03a, then GET `/works` and `/works/new` with the cookie → 200 and HTML contains `내 작품` / `새 작품`. `pnpm lint && pnpm typecheck` clean.

---

### Task T04: Chapters, versions, resume point

**Files:**
- Create: `src/server/chapters.ts`, `src/server/user-state.ts`, `src/server/actions/chapters.ts`, `src/server/actions/manuscript.ts`, tests `src/server/chapters.test.ts`, `src/server/user-state.test.ts`

**Interfaces:**
- Consumes: T03b `requireWorkRole`, `requireRowWork`, `recordChange`, `recomputeAppearances`; T02 `countChars`.
- Produces:
  - `type ChapterListItem = Omit<ChapterRow, 'body'>`.
  - `listChapters(db, actor, workId, o?: { includeArchived?: boolean }): Promise<ChapterListItem[]>` (position asc).
  - `getChapter(db, actor, chapterId): Promise<ChapterRow & { role: Role }>` (viewer).
  - `createChapter(db, actor, input: { workId: string; title?: string; body?: string; status?: ChapterStatus; position?: number; versionSource?: 'save' | 'ai_draft' }): Promise<ChapterRow>` (editor; default position = max(non-archived)+1, default title `${position}화`, version 1 + `chapter_versions` row with source `versionSource ?? 'save'`).
  - `createChaptersBulk(db, actor, input: { workId: string; chapters: { title: string; body: string }[]; status: ChapterStatus; versionSource: 'import' }): Promise<ChapterRow[]>` (editor; appended in order; one transaction; appearances recomputed).
  - `saveChapter(db, actor, input: { chapterId: string; title?: string; body?: string; expectedVersion: number; source?: 'save' | 'ai_draft' | 'restore' }): Promise<ChapterRow>` (editor). Version mismatch → `AppError('CONFLICT','다른 곳에서 먼저 수정된 원고가 있습니다.', { currentVersion })`. Increments `version`, recomputes counts and appearances. Snapshot rule: if the latest `chapter_versions` row has same `createdBy`, `source === 'save'`, new source `'save'`, and `updatedAt` within 10 minutes → update that row (title, body, charCount, updatedAt, version); else insert a new row.
  - `setChapterStatus(db, actor, chapterId, status: ChapterStatus)`, `setChapterPublishedOn(db, actor, chapterId, publishedOn: string | null)`, `moveChapter(db, actor, chapterId, direction: 'up' | 'down'): Promise<void>` (swap with neighbor among non-archived; no-op at ends), `archiveChapter(db, actor, chapterId)`, `restoreChapter(db, actor, chapterId)` — all editor, return `ChapterRow` except move.
  - `listVersions(db, actor, chapterId): Promise<Omit<ChapterVersionRow, 'body'>[]>` (newest first), `getVersion(db, actor, versionId): Promise<ChapterVersionRow>`, `restoreVersion(db, actor, input: { versionId: string; expectedVersion: number }): Promise<ChapterRow>` (saveChapter with `source 'restore'`, always a new version row).
  - `setChapterSummary(db, actor, input: { chapterId: string; summary: string; proposerType: ProposerType; proposalId?: string | null }): Promise<ChapterRow>` (editor; records change `targetTable 'chapters'`, `action 'update'`, before/after `{ summary }`, summary text `'회차 요약 수정: ' + chapterLabel(...)`).
  - `openNextChapter(db, actor, workId): Promise<{ chapterId: string; created: boolean }>` (editor: newest-position `draft` chapter if any, else create next).
  - `getLatestPosition(db, workId): Promise<number>` (max non-archived position, 0 if none).
  - `user-state.ts`: `saveResumePoint(db, actor, input: { workId: string; chapterId?: string | null; cursor?: number | null; path: string }): Promise<void>` (viewer, upsert); `getResumePoint(db, actor, workId?: string): Promise<{ workId: string; workTitle: string; chapterId: string | null; chapterTitle: string | null; chapterPosition: number | null; cursor: number | null; path: string; updatedAt: Date } | null>` (latest across the user's works when no workId; skips archived works/chapters).
  - `actions/chapters.ts`: `createChapterAction({ workId, title? })`, `setChapterStatusAction({ chapterId, status })`, `setChapterPublishedOnAction({ chapterId, publishedOn })`, `moveChapterAction({ chapterId, direction })`, `archiveChapterAction({ chapterId })`, `restoreChapterAction({ chapterId })`, `openNextChapterAction({ workId })`, `setChapterSummaryAction({ chapterId, summary })` (author edit: `proposerType 'author'`).
  - `actions/manuscript.ts`: `saveChapterAction({ chapterId, title?, body?, expectedVersion, source? })` → returns `{ version: number; updatedAt: string; charCount: number; charCountNoSpaces: number }` on success (on CONFLICT the ActionResult error carries the message), `restoreVersionAction({ versionId, expectedVersion })`, `saveResumePointAction({ workId, chapterId?, cursor?, path })`, `getVersionAction({ versionId })`.

- [ ] **Step 1: Tests first** (`chapters.test.ts`): `createChapter defaults title '1화' and position 1, then '2화'`; `saveChapter increments version and counts` (body `'가 나\n다'` → charCount 4, charCountNoSpaces 3); `saveChapter with stale expectedVersion → CONFLICT`; `saves within 10 minutes coalesce into one version row` (two saves → `listVersions` length 2: initial + one save); `save after 11 minutes adds a version` (use `vi.setSystemTime`); `restoreVersion creates a new version with old body`; `moveChapter swaps positions`; `viewer cannot save → FORBIDDEN`; `non-member getChapter → NOT_FOUND`; `setChapterSummary records a change_log row`; `openNextChapter returns latest draft, else creates next`; `createChaptersBulk appends after existing positions`. `user-state.test.ts`: save then get returns chapter info; latest-across-works ordering.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T05: Wiki entries, facts, naming rules, style cards

**Files:**
- Create: `src/server/wiki.ts`, `src/server/facts.ts`, `src/server/naming.ts`, `src/server/styles.ts`, `src/server/actions/wiki.ts`, tests `src/server/{wiki,facts,naming,styles}.test.ts`

**Interfaces:**
- Consumes: T03b (`requireWorkRole`, `requireRowWork`, `recordChange`, `recomputeAppearancesForEntry`, `getEntryAppearances`), T02 (`stripJosa`, `labels`).
- Produces:
  - `type ChangeOpts = { proposerType?: ProposerType; proposalId?: string | null }` (default `{ proposerType: 'author' }`) — used by every mutating wiki/fact/thread/relation/naming/style function in T05/T06.
  - `type EntryInput = { kind: EntryKind; name: string; aliases?: string[]; summary?: string; body?: string; fields?: Record<string, string>; customFields?: { key: string; value: string }[] }`.
  - `listEntries(db, actor, workId, o?: { kinds?: EntryKind[]; includeArchived?: boolean; query?: string }): Promise<EntryRow[]>` (name asc; query matches name/aliases/summary, case-insensitive).
  - `getEntry(db, actor, entryId): Promise<EntryDetail>` where `EntryDetail = EntryRow & { role: Role; facts: FactView[]; relations: { id: string; otherEntryId: string; otherName: string; kind: string; description: string; direction: 'out' | 'in'; directed: boolean; startPosition: number | null; endPosition: number | null }[]; appearances: { chapterId: string; position: number; title: string; mentionCount: number }[]; threads: { id: string; title: string; status: ThreadStatus }[] }`.
  - `type FactView = FactRow & { sourceChapter: { id: string; position: number; title: string; archived: boolean } | null; supersededBy: { id: string; content: string; validFromPosition: number | null } | null }` (facts ordered: active before superseded; then confirmed, assumed, undecided; then createdAt).
  - `createEntry(db, actor, input: EntryInput & { workId: string }, o?: ChangeOpts): Promise<EntryRow>` (editor; trims name/aliases, drops empty and duplicate aliases and alias equal to name; empty name → `VALIDATION '이름을 입력하세요.'`; same kind + same name non-archived exists → `CONFLICT '같은 이름의 카드가 이미 있습니다.'`; records change summary `'${ENTRY_KIND_LABEL[kind]} '${name}' 생성'`; then `relinkFactsForEntry` and `recomputeAppearancesForEntry`).
  - `updateEntry(db, actor, entryId, patch: Partial<EntryInput>, o?: ChangeOpts)`, `archiveEntry(db, actor, entryId, o?)`, `restoreEntry(db, actor, entryId, o?)` → `EntryRow`; summaries `'…' 수정'`, `'…' 보관'`, `'…' 복원'`.
  - `findEntryByName(db, workId: string, name: string): Promise<EntryRow | null>` (non-archived; compare `stripJosa(trim(name))` against names and aliases).
  - `facts.ts`: `type FactInput = { workId: string; entryId?: string | null; subjectName?: string; content: string; status: FactStatus; sourceType: FactSourceType; sourceChapterId?: string | null; evidence?: string; validFromPosition?: number | null; validToPosition?: number | null }`; `listFacts(db, actor, workId, o?: { entryId?: string; chapterId?: string; status?: FactStatus; includeArchived?: boolean; includeSuperseded?: boolean }): Promise<FactView[]>`; `createFact(db, actor, input: FactInput, o?: ChangeOpts): Promise<FactRow>` (resolves `entryId` from `subjectName` via `findEntryByName` when absent; `subjectName` defaults to entry name; empty content → `VALIDATION '사실 내용을 입력하세요.'`); `updateFact(db, actor, factId, patch: Partial<Pick<FactRow,'content'|'status'|'entryId'|'evidence'|'sourceChapterId'|'validFromPosition'|'validToPosition'>>, o?)`; `archiveFact(db, actor, factId, o?)`; `supersedeFact(db, actor, input: { factId: string; fromPosition: number; content: string; status: FactStatus; evidence?: string; sourceChapterId?: string | null; sourceType?: FactSourceType }, o?): Promise<{ oldFact: FactRow; newFact: FactRow }>` (one transaction: old `validToPosition = fromPosition - 1`, `supersededByFactId = new.id`; new fact `validFromPosition = fromPosition`, same entry/subject; two change rows; `fromPosition` must be > old `validFromPosition ?? 0` else `VALIDATION '바뀌는 회차는 기존 사실이 유효해진 회차 이후여야 합니다.'`); `relinkFactsForEntry(db, entry: EntryRow): Promise<number>` (no change_log; links facts with `entryId` null whose `stripJosa(subjectName)` equals the entry name or an alias); `factsValidAt(facts: FactRow[], position: number): FactRow[]` (pure: `(validFromPosition ?? -∞) ≤ position ≤ (validToPosition ?? +∞)` and not archived).
  - `naming.ts`: `listNamingRules(db, actor, workId)`, `createNamingRule(db, actor, input: { workId: string; canonical: string; variants: string[]; note?: string; entryId?: string | null }, o?)`, `updateNamingRule(db, actor, ruleId, patch, o?)`, `archiveNamingRule(db, actor, ruleId, o?)` (editor; variants trimmed, empty removed, canonical not allowed among variants → `VALIDATION '올바른 표기는 잘못된 표기 목록에 넣을 수 없습니다.'`).
  - `styles.ts`: `listStyleCards(db, actor, workId): Promise<(StyleCardRow & { entryName: string | null })[]>`, `createStyleCard(db, actor, input: { workId: string; entryId?: string | null; name: string; tone?: string; rules?: string; examples?: string }, o?)`, `updateStyleCard(db, actor, cardId, patch, o?)`, `archiveStyleCard(db, actor, cardId, o?)`.
  - `actions/wiki.ts`: `createEntryAction, updateEntryAction, archiveEntryAction, restoreEntryAction, createFactAction, updateFactAction, archiveFactAction, supersedeFactAction, createNamingRuleAction, updateNamingRuleAction, archiveNamingRuleAction, createStyleCardAction, updateStyleCardAction, archiveStyleCardAction`. Input zod schemas mirror the service inputs plus ids.

- [ ] **Step 1: Tests first** — `wiki.test.ts`: create entry records change + trims/dedupes aliases; duplicate name → CONFLICT; `findEntryByName(workId,'서윤이가')` finds entry with alias '서윤'; creating an entry links earlier unlinked facts with subjectName '서윤'; `getEntry` returns facts with `sourceChapter.archived === true` when the source chapter is archived; viewer cannot create → FORBIDDEN. `facts.test.ts`: createFact resolves entry by subjectName; `supersedeFact` sets old.validToPosition = 11 for fromPosition 12 and links supersededByFactId; invalid fromPosition → VALIDATION; `factsValidAt` excludes a fact valid to 11 at position 12 and includes an unbounded fact; status change recorded in change_log. `naming.test.ts`: canonical in variants → VALIDATION; archive keeps row. `styles.test.ts`: create/update/archive records changes.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T06: Threads (foreshadowing ledger) and relations

**Files:**
- Create: `src/server/threads.ts`, `src/server/relations.ts`, `src/server/actions/threads.ts`, `src/server/actions/relations.ts`, tests `src/server/{threads,relations}.test.ts`

**Interfaces:**
- Consumes: T03b, `ChangeOpts` shape from T05 (re-declare locally as the same type if T05 is not finished: `{ proposerType?: ProposerType; proposalId?: string | null }`).
- Produces:
  - `type ThreadInput = { workId: string; title: string; description?: string; status: 'planned' | 'planted'; plantedChapterId?: string | null; targetChapterPosition?: number | null; importance?: Importance; relatedEntryIds?: string[] }`.
  - `type ThreadView = ThreadRow & { plantedPosition: number | null; resolvedPosition: number | null; relatedEntries: { id: string; name: string }[]; eventCount: number; overdue: boolean; latestPosition: number }` (`overdue` = status in planted/developing, target not null, latestPosition > target).
  - `listThreads(db, actor, workId, o?: { statuses?: ThreadStatus[]; includeArchived?: boolean }): Promise<ThreadView[]>` (importance high→low, then plantedPosition asc).
  - `getThread(db, actor, threadId): Promise<ThreadView & { events: (ThreadEventRow & { chapterPosition: number | null; chapterTitle: string | null })[] }>` (events by chapter position then createdAt).
  - `createThread(db, actor, input: ThreadInput, o?: ChangeOpts): Promise<ThreadRow>` (editor; `planted` requires `plantedChapterId` → else `VALIDATION '심은 회차를 선택하세요.'`; when planted also inserts a `planted` event; change rows for thread and event; thread snapshot includes `relatedEntryIds`).
  - `updateThread(db, actor, threadId, patch: { title?: string; description?: string; targetChapterPosition?: number | null; importance?: Importance; relatedEntryIds?: string[] }, o?)`.
  - `addThreadEvent(db, actor, input: { threadId: string; kind: ThreadEventKind; chapterId?: string | null; note?: string; evidence?: string }, o?: ChangeOpts): Promise<ThreadEventRow>` — rules (messages exact): non-`note` event on resolved/discarded thread → `BAD_STATE '이미 회수되었거나 폐기된 떡밥입니다.'`; `planted` on a thread already planted → `BAD_STATE '이미 심은 떡밥입니다.'`; `developed`/`resolved` without a planted chapter → `VALIDATION '아직 심지 않은 떡밥입니다. 먼저 심은 회차를 기록하세요.'`; `developed`/`resolved`/`planted` require `chapterId` → `VALIDATION '회차를 선택하세요.'`; developed position < planted → `VALIDATION '발전 기록은 떡밥을 심은 회차(N화) 이후여야 합니다.'`; resolved position ≤ planted → `VALIDATION '회수는 떡밥을 심은 회차(N화) 이후에만 기록할 수 있습니다.'` (N = planted position). Transitions: planted → status `planted` + `plantedChapterId`; developed → `developing`; resolved → `resolved` + `resolvedChapterId`; discarded → `discarded`; note → none. Records change rows for the event (create) and the thread (update) in one transaction.
  - `archiveThread(db, actor, threadId, o?)`, `archiveThreadEvent(db, actor, eventId, o?)`.
  - `relations.ts`: `type RelationView = RelationRow & { sourceName: string; targetName: string }`; `listRelations(db, actor, workId, o?: { entryId?: string; includeArchived?: boolean }): Promise<RelationView[]>`; `createRelation(db, actor, input: { workId: string; sourceEntryId: string; targetEntryId: string; kind: string; description?: string; directed?: boolean; startPosition?: number | null; endPosition?: number | null }, o?): Promise<RelationRow>` (same entry → `VALIDATION '같은 카드끼리는 연결할 수 없습니다.'`; start > end → `VALIDATION '시작 회차가 끝 회차보다 늦습니다.'`; entries must belong to the work → `NOT_FOUND`); `updateRelation(…)`, `archiveRelation(…)`; `getGraphData(db, actor, workId): Promise<{ nodes: { id: string; name: string; kind: EntryKind; firstAppearance: number | null }[]; edges: { id: string; source: string; target: string; kind: string; description: string; directed: boolean; startPosition: number | null; endPosition: number | null }[]; latestPosition: number }>` (non-archived; uses `getFirstAppearances`).
  - `actions/threads.ts`: `createThreadAction, updateThreadAction, addThreadEventAction, archiveThreadAction, archiveThreadEventAction`; `actions/relations.ts`: `createRelationAction, updateRelationAction, archiveRelationAction`.

- [ ] **Step 1: Tests first** — `threads.test.ts`: planted thread without chapter → VALIDATION; resolved in the planting chapter → VALIDATION with message containing `'3화'` for planted position 3; resolved in chapter 5 → status `resolved`, `resolvedChapterId` set; developed at same chapter as planted allowed; event on resolved thread → BAD_STATE; planned → planted transition via `planted` event; `listThreads` marks `overdue` when latest chapter position 8 > target 6; each event writes two change rows. `relations.test.ts`: self relation → VALIDATION; start > end → VALIDATION; `getGraphData` returns nodes with firstAppearance from appearances and only non-archived edges.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T07: Issues, comments, members and invites, schedule items

**Files:**
- Create: `src/server/issues.ts`, `src/server/comments.ts`, `src/server/members.ts`, `src/server/schedule.ts`, `src/server/actions/{issues,comments,members,schedule}.ts`, tests `src/server/{issues,comments,members,schedule}.test.ts`

**Interfaces:**
- Consumes: T03b, T02 `randomToken`.
- Produces:
  - `issues.ts`: `type NewIssue = { kind: IssueKind; severity: Severity; quote: string; quoteStart: number | null; quoteEnd: number | null; entryId: string | null; factId: string | null; wikiExcerpt: string; explanation: string; suggestion: string }`; `replaceOpenIssues(db, input: { workId: string; chapterId: string; runId: string | null; issues: NewIssue[] }): Promise<IssueRow[]>` (no access check — callers check; deletes `open` issues of the chapter, inserts new); `listIssues(db, actor, chapterId, o?: { statuses?: IssueStatus[] }): Promise<IssueRow[]>` (viewer; severity high→low then quoteStart); `resolveIssue(db, actor, input: { issueId: string; status: 'accepted' | 'dismissed' | 'wiki_updated' }): Promise<IssueRow>` (editor); `reopenIssue(db, actor, issueId)`; `countOpenIssues(db, workId: string): Promise<number>`.
  - `comments.ts`: `type CommentView = CommentRow & { authorName: string; replies: (CommentRow & { authorName: string })[] }`; `listComments(db, actor, chapterId): Promise<CommentView[]>` (top-level by quoteStart then createdAt); `addComment(db, actor, input: { chapterId: string; body: string; quote?: string; quoteStart?: number | null; quoteEnd?: number | null; parentId?: string | null }): Promise<CommentRow>` (commenter; empty body → `VALIDATION '코멘트 내용을 입력하세요.'`; reply to a reply attaches to the top-level parent); `setCommentResolved(db, actor, input: { commentId: string; resolved: boolean }): Promise<CommentRow>` (author with commenter+, or editor+); `deleteComment(db, actor, commentId): Promise<void>` (author or owner; deletes replies).
  - `members.ts`: `listMembers(db, actor, workId): Promise<{ userId: string; name: string; email: string; role: Role; createdAt: Date }[]>` (viewer); `createInvite(db, actor, input: { workId: string; role: Exclude<Role, 'owner'>; expiresInDays?: number }): Promise<InviteRow>` (owner; default 7 days; token `randomToken()`); `listInvites(db, actor, workId): Promise<InviteRow[]>` (owner; active only); `revokeInvite(db, actor, inviteId): Promise<void>`; `getInviteByToken(db, token): Promise<{ invite: InviteRow; workTitle: string; inviterName: string; usable: boolean } | null>`; `acceptInvite(db, actor, token): Promise<{ workId: string }>` (unusable → `BAD_STATE '만료되었거나 사용할 수 없는 초대입니다.'`; existing member keeps the higher role; marks accepted, single use); `changeMemberRole(db, actor, input: { workId: string; userId: string; role: Exclude<Role, 'owner'> }): Promise<void>` (owner; changing the owner → `BAD_STATE '소유자의 역할은 바꿀 수 없습니다.'`); `removeMember(db, actor, input: { workId: string; userId: string }): Promise<void>` (owner removes others; any member may remove self; removing the owner → `BAD_STATE '소유자는 작품에서 나갈 수 없습니다.'`).
  - `schedule.ts`: `listScheduleItems(db, actor, workId, range?: { from: string; to: string }): Promise<ScheduleItemRow[]>`; `createScheduleItem(db, actor, input: { workId: string; kind: ScheduleKind; title: string; date: string; endDate?: string | null; chapterId?: string | null; note?: string }): Promise<ScheduleItemRow>` (editor; `endDate < date` → `VALIDATION '끝나는 날이 시작일보다 빠릅니다.'`; hiatus without endDate → endDate = date; empty title → default `SCHEDULE_KIND_LABEL[kind]`); `updateScheduleItem(db, actor, itemId, patch)`; `deleteScheduleItem(db, actor, itemId)`; `setScheduleItemDone(db, actor, input: { itemId: string; done: boolean })`; `getScheduleInput(db, actor, workId): Promise<ScheduleInput>`.
  - Actions: `actions/issues.ts`: `resolveIssueAction, reopenIssueAction`; `actions/comments.ts`: `addCommentAction, setCommentResolvedAction, deleteCommentAction`; `actions/members.ts`: `createInviteAction, revokeInviteAction, acceptInviteAction, changeMemberRoleAction, removeMemberAction`; `actions/schedule.ts`: `createScheduleItemAction, updateScheduleItemAction, deleteScheduleItemAction, setScheduleItemDoneAction`.

- [ ] **Step 1: Tests first** — issues: replace keeps resolved issues and swaps open ones; viewer cannot resolve. comments: commenter can add; viewer cannot (FORBIDDEN); reply-to-reply attaches to top-level; another commenter cannot resolve someone else's comment (FORBIDDEN), editor can. members: invite → accept by stranger → member with role; reuse → BAD_STATE; expired (`vi.setSystemTime` +8 days) → BAD_STATE; existing editor accepting a viewer invite stays editor; owner role change → BAD_STATE; member leaves self. schedule: hiatus without endDate gets endDate = date; endDate < date → VALIDATION; `getScheduleInput` returns resolved settings and chapters ordered by position.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T08: AI core — clients, runner with usage limits, context pack

**Files:**
- Create: `src/ai/types.ts`, `src/ai/anthropic.ts`, `src/ai/fake.ts`, `src/ai/index.ts`, `src/ai/run.ts`, `src/ai/context.ts`, tests `src/ai/{fake,run,context,anthropic}.test.ts`

**Interfaces:**
- Consumes: T01 schema/types, T02 `findMentions`, `seoulDayStart`, `isDemoMode`, T03b `requireWorkRole`, T05's pure `factsValidAt` semantics (re-implement the same predicate locally to avoid a wave-2 import).
- Produces:
  - `types.ts`: `type AiEffort = 'low'|'medium'|'high'|'xhigh'|'max'`; `type AiUsage = { inputTokens: number; outputTokens: number }`; `interface GenerateObjectArgs<T> { system: string; prompt: string; schema: z.ZodType<T>; effort: AiEffort; maxTokens: number; fake: () => T; model?: string }`; `interface StreamTextArgs { system: string; prompt: string; effort: AiEffort; maxTokens: number; fake: () => string; model?: string }`; `interface AiClient { provider: 'anthropic' | 'fake'; defaultModel: string; generateObject<T>(a: GenerateObjectArgs<T>): Promise<{ object: T; usage: AiUsage; model: string }>; streamText(a: StreamTextArgs): { textStream: AsyncIterable<string>; final: Promise<{ text: string; usage: AiUsage; model: string }> } }`; `interface AiTaskDef<I, O> { name: AiTaskName; effort: AiEffort; maxTokens: number; system: string; buildPrompt(input: I): string; schema: z.ZodType<O>; fake(input: I): O; postProcess?(output: O, input: I): O; model?: () => string | undefined }`.
  - `anthropic.ts`: `class AnthropicAiClient implements AiClient` — `new Anthropic()`; `generateObject` uses `client.messages.parse({ model, max_tokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: prompt }], output_config: { format: zodOutputFormat(schema), effort } })` and reads `parsed_output`; when `model` ∈ `['claude-opus-5-5','claude-opus-5','claude-fable-5-1','claude-sonnet-5-5']` and the SDK's beta types accept it, call `client.beta.messages.parse` with `betas: ['server-side-fallback-2026-07-01']` and `fallbacks: 'default'` instead; `streamText` uses `client.messages.stream` (same system/effort/fallback rules) yielding `text_delta`s, `final` from `finalMessage()`. `stop_reason` `'refusal'` → `AppError('AI_ERROR','AI가 이 요청을 처리하지 않았습니다.')`; `'max_tokens'` → `AppError('AI_ERROR','AI 응답이 너무 길어 중간에 끊겼습니다.')`; null `parsed_output` → `AppError('AI_ERROR','AI 응답 형식이 올바르지 않습니다.')`; SDK errors → `AppError('AI_ERROR', 'AI 호출에 실패했습니다: ' + short reason)` (typed classes `Anthropic.RateLimitError`, `AuthenticationError`, `APIError`). Usage from `response.usage.input_tokens/output_tokens`. Check exact SDK names in `node_modules/@anthropic-ai/sdk` (`helpers/zod` → `zodOutputFormat`).
  - `fake.ts`: `class FakeAiClient implements AiClient` (`provider 'fake'`, `defaultModel 'fake'`); `generateObject` returns `schema.parse(args.fake())`, usage zeros; `streamText` splits `args.fake()` into ~40-char chunks.
  - `index.ts`: `getAiClient(): AiClient` (memoized; fake when `isDemoMode()`), `setAiClientForTests(c: AiClient | null): void`, `getDefaultModel(): string` (`ANTHROPIC_MODEL ?? 'claude-opus-5-5'`), `getImportModel(): string` (`ANTHROPIC_MODEL_IMPORT ?? getDefaultModel()`).
  - `run.ts`: `type AiRunMeta = { userId: string; workId: string | null; chapterId?: string | null }`; `runAiTask<I, O>(db: Db, meta: AiRunMeta, task: AiTaskDef<I, O>, input: I, client?: AiClient): Promise<{ output: O; runId: string }>`; `startAiStream(db, meta, args: { task: AiTaskName; effort: AiEffort; maxTokens: number; system: string; prompt: string; fake: () => string; model?: string }, client?): Promise<{ runId: string; textStream: AsyncIterable<string>; done: Promise<string> }>` (on completion stores `output: { text }`); `getTodayUsage(db, userId, now = new Date()): Promise<number>` (sum input+output tokens since `seoulDayStart(now)`); `assertWithinLimit(db, userId): Promise<void>` (limit `Number(process.env.AI_DAILY_TOKEN_LIMIT ?? 3000000)`, `0` = unlimited; over → `AppError('AI_LIMIT','오늘 AI 사용량 한도를 넘었습니다. 내일 다시 시도해 주세요.')`); `listAiRuns(db, actor, workId, o: { task: AiTaskName; chapterId?: string; limit?: number }): Promise<AiRunRow[]>` (viewer, newest first, done only).
  - `context.ts`: `type PackFact = { ref: string; id: string; content: string; status: FactStatus; sourcePosition: number | null; validFromPosition: number | null; validToPosition: number | null; evidence: string }`; `type PackEntry = { ref: string; id: string; kind: EntryKind; name: string; aliases: string[]; summary: string; fields: Record<string, string>; mentionCount: number; facts: PackFact[] }`; `type PackThread = { ref: string; id: string; title: string; description: string; status: ThreadStatus; plantedPosition: number | null; targetPosition: number | null; importance: Importance; overdue: boolean }`; `type ContextPack = { position: number; entries: PackEntry[]; threads: PackThread[]; relations: { sourceName: string; targetName: string; kind: string; description: string }[]; previousSummaries: { position: number; title: string; summary: string }[]; namingRules: { canonical: string; variants: string[] }[]; stats: { totalEntries: number; selectedEntries: number; approxChars: number } }`; `buildContextPack(db: Db, workId: string, input: { text: string; position: number; extraEntryIds?: string[]; budgetChars?: number }): Promise<ContextPack>` (algorithm spec §F9; default budget 12000; refs `E1…`, `F1…`, `T1…` assigned in output order; facts filtered by validity at `position`; max 15 facts/entry, confirmed→assumed→undecided; max 15 threads with `plantedPosition ≤ position` or status `planned`, importance then overdue first; relations among selected entries valid at position; previous 2 summaries before position); `renderContextPack(pack: ContextPack): string` (deterministic; sections `<entries>`, `<threads>`, `<relations>`, `<previous_chapters>`, `<naming>`; each fact line `[F3][확정] 내용 (출처 5화, 12화부터)`; status labels 확정/가정/미정); `resolveRefs(pack: ContextPack): { facts: Map<string, PackFact & { entryId: string }>; entries: Map<string, PackEntry>; threads: Map<string, PackThread> }`.

- [ ] **Step 1: Tests first** — `fake.test.ts`: generateObject validates fake output (schema mismatch throws); streamText joins back to the full text. `run.test.ts`: `runAiTask` stores a done `ai_runs` row with output; failing client → run status `error` and `AI_ERROR`; `getTodayUsage` counts runs after KST midnight only (insert a run at `2026-10-16T14:59:00Z` and one at `15:01Z`, now `2026-10-16T16:00:00Z` → only the second counts); limit exceeded → `AI_LIMIT`; `AI_DAILY_TOKEN_LIMIT=0` disables. `context.test.ts`: text mentioning '서윤' selects that entry with ref `E1`; a fact valid to position 11 is excluded at position 12; budget trimming drops lowest-ranked entries first (budget 300); threads planted after `position` are excluded; render output is byte-identical across two calls. `anthropic.test.ts`: with a stubbed SDK client (inject via constructor param `sdk?: Anthropic`), `stop_reason 'refusal'` → AI_ERROR; fallback params sent for `claude-opus-5-5` and not for `claude-haiku-5-5`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T09: Client-side libraries, Web Worker, local draft store, autosave hook

**Files:**
- Create: `src/lib/import/{decode,docx,split,parse-file}.ts`, `src/lib/diff.ts`, `src/lib/backup.ts`, `src/lib/search.ts`, `src/lib/schedule.ts`, `src/workers/text.worker.ts`, `src/lib/client/{worker-client,local-store,use-autosave}.ts`, tests `src/lib/import/*.test.ts`, `src/lib/{diff,backup,search,schedule}.test.ts`, `src/lib/client/{local-store,use-autosave}.test.ts(x)`

**Interfaces:**
- Consumes: T01 `ScheduleInput`, `ExportPayload`, `WorkSettings`; T02 `findMentions`, `countChars`, dates, labels; `es-hangul` `getChoseong`.
- Produces:
  - `decode.ts`: `decodeTextFile(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'euc-kr' }` (BOM → UTF-8 fatal → EUC-KR; strips BOM; normalizes `\r\n` → `\n`).
  - `docx.ts`: `extractDocxText(bytes: ArrayBuffer): Promise<string>` (mammoth `extractRawText({ arrayBuffer })`).
  - `parse-file.ts`: `parseManuscriptFile(name: string, bytes: ArrayBuffer): Promise<{ text: string; encoding: string; format: 'txt' | 'md' | 'docx' }>`; `.hwp`/`.hwpx` → throws `Error('HWP 파일은 지원하지 않습니다. 한글에서 DOCX 또는 TXT로 저장한 뒤 올려 주세요.')`; other extensions → `Error('지원하지 않는 파일 형식입니다. TXT, MD, DOCX 파일을 올려 주세요.')`.
  - `split.ts`: `type SplitChapter = { title: string; body: string; startLine: number }`; `detectHeading(line: string): string | null`; `splitChapters(text: string, o?: { fallbackChars?: number }): { chapters: SplitChapter[]; method: 'headings' | 'separators' | 'size' | 'single' }` (headings per spec §F6; text before the first heading becomes a chapter titled `머리말` only if it has ≥ 200 non-space chars, else it is dropped; heading line becomes the title and is excluded from body; separators `***`, `---`, `* * *`, `＊＊＊` lines; size fallback cuts at the paragraph boundary nearest each `fallbackChars` (default 5500) and titles `1화`, `2화`, …; empty text → `{ chapters: [], method: 'single' }`).
  - `diff.ts`: `type DiffPart = { type: 'equal' | 'insert' | 'delete'; value: string }`; `diffTexts(a: string, b: string, mode: 'chars' | 'words' | 'lines' = 'words'): DiffPart[]`; `diffStats(parts: DiffPart[]): { inserted: number; deleted: number }` (code points).
  - `backup.ts`: `type BackupFile = { path: string; content: string }`; `buildBackupFiles(p: ExportPayload): BackupFile[]` (spec §F5 layout; chapter files `chapters/${pad3(position)}-${safeName(title)}.md` containing `# ${chapterLabel}` + body; `wiki/인물.md`, `wiki/세계관.md`, `wiki/떡밥.md`, `wiki/표기.md`, `history.md`, `work.json` = `JSON.stringify(p, null, 2)`; all paths NFC); `zipBackup(files: BackupFile[]): Uint8Array` (fflate `zipSync`, UTF-8 names); `backupFileName(title: string, date: string): string` → `다음화-백업-${safeName(title)}-${YYYYMMDD}.zip`; `safeName` replaces `/\:*?"<>|` with `_` and trims to 40 chars.
  - `search.ts`: `type SearchItem = { id: string; kind: string; name: string; aliases: string[]; summary: string }`; `type SearchIndex = { items: SearchItem[]; keys: { id: string; norm: string[]; choseong: string[] }[] }`; `buildSearchIndex(items: SearchItem[]): SearchIndex`; `searchIndex(index: SearchIndex, query: string, limit = 20): SearchItem[]` (ranking: exact name/alias > prefix > substring > choseong match (query consisting only of jamo consonants matches `getChoseong(name)`) > summary substring; ties by name).
  - `schedule.ts`: `type ScheduleResult = { bufferCount: number; slots: { date: string; chapterId: string | null; chapterTitle: string | null; position: number | null }[]; bufferRunsOutOn: string | null; nextDeadline: { id: string; title: string; date: string; daysLeft: number } | null; warnings: string[]; hiatusDays: string[] }`; `computeSchedule(input: ScheduleInput, today: string, horizonDays = 42): ScheduleResult` (buffer = status `done` and (`publishedOn` null or > today), ordered by position; slots from `today` inclusive on `publishDays`, `chaptersPerPublishDay` per day, skipping days inside non-done `hiatus` items; buffer chapters fill slots in order; `bufferRunsOutOn` = first slot without a chapter; warnings exact: `비축분이 목표(${target}화)보다 적습니다 (현재 ${n}화).` when n < target; `마감이 ${d}일 남았습니다: ${title}` for undone deadlines within 3 days (d ≥ 0); `지난 마감이 있습니다: ${title}` for undone past deadlines).
  - `text.worker.ts` exposes via `Comlink.expose` an object implementing `TextWorkerApi = { parseFile(name: string, bytes: ArrayBuffer): Promise<{ text: string; encoding: string; format: string }>; splitChapters(text: string, o?: { fallbackChars?: number }): Promise<ReturnType<typeof splitChapters>>; diffTexts(a: string, b: string, mode?: 'chars' | 'words' | 'lines'): Promise<DiffPart[]>; buildBackupZip(p: ExportPayload): Promise<Uint8Array>; findMentions(text: string, targets: MentionTarget[]): Promise<Mention[]>; computeSchedule(input: ScheduleInput, today: string): Promise<ScheduleResult>; setSearchItems(items: SearchItem[]): Promise<void>; search(query: string, limit?: number): Promise<SearchItem[]> }`; `TextWorkerApi` type exported from `worker-client.ts`.
  - `worker-client.ts`: `getTextWorker(): TextWorkerApi` (client-only lazy singleton via `new Worker(new URL('../../workers/text.worker.ts', import.meta.url), { type: 'module' })` + `Comlink.wrap`, following T00's bundler finding; when `Worker` is undefined, returns an in-thread implementation with the same API).
  - `local-store.ts`: `type LocalDraft = { title: string; body: string; savedAt: number; baseVersion: number }`; `saveDraft(chapterId: string, d: LocalDraft): Promise<void>`, `getDraft(chapterId: string): Promise<LocalDraft | undefined>`, `clearDraft(chapterId: string): Promise<void>`, `getKv<T>(key: string): Promise<T | undefined>`, `setKv<T>(key: string, v: T): Promise<void>` — DB name `daeumhwa`, stores `drafts`, `kv`; every call wrapped in try/catch (failures become no-ops / undefined).
  - `use-autosave.ts`: `useAutosave(o: { chapterId: string; initialTitle: string; initialBody: string; initialVersion: number; save: (input: { title: string; body: string; expectedVersion: number }) => Promise<ActionResult<{ version: number; updatedAt: string }>>; serverDelayMs?: number /* 3000 */; localDelayMs?: number /* 500 */ }): { title: string; body: string; setTitle(t: string): void; setBody(b: string): void; status: 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict' | 'error'; version: number; lastSavedAt: Date | null; saveNow(): Promise<void>; replaceAll(title: string, body: string, version: number): void; recoverable: LocalDraft | null; acceptRecovery(): void; discardRecovery(): void; setComposing(composing: boolean): void }` — local save after `localDelayMs`; server save after `serverDelayMs` of inactivity, on `saveNow`, on `visibilitychange` hidden; never saves while `composing` (resumes after `setComposing(false)`); CONFLICT → status `'conflict'`; other failure → `'offline'` (network) or `'error'`, local draft kept; on mount, any local draft whose text differs from the server copy becomes `recoverable` (also when it was written against an older server version — the dialog says so); drafts are keyed per user (`userId:chapterId`) and cleared on sign-out; successful server save clears the local draft.

- [ ] **Step 1: Tests first** — decode: EUC-KR bytes `[190,200,179,231,199,207,188,188,191,228,44,32,192,204,188,173,192,177,192,212,180,207,180,217,46]` → `'안녕하세요, 이서윤입니다.'` encoding `euc-kr`; UTF-16LE BOM bytes `[255,254,0,172,152,176]` → `'가나'`; UTF-8 with BOM stripped; CRLF normalized. (Use only KS X 1001 characters in EUC-KR fixtures: Node's decoder lacks the CP949 extensions that browsers support.) parse-file: `.hwp` → throws the Korean message. split: `'1화\n가\n\n2화 - 만남\n나'` → 2 chapters titled `1화`, `2화 - 만남`; `'<프롤로그>\n…'` detected; `'제 3 화'`, `'Episode 4'`, `'EP.5'`, `'[6화]'`, `'【7화】'`, `'# 8화'` detected by `detectHeading`; `'1화는 재미있었다'` not a heading (heading lines are ≤ 40 chars and the number token is followed by end/space/punctuation, not a Hangul particle); separators split; size fallback for 12000 chars without headings → 3 chapters; 300 synthetic chapters (each `${n}화\n` + 5000 chars) split in < 2000 ms. diff: words diff of `'서윤은 웃었다'` vs `'서윤은 울었다'` has one delete + one insert. backup: file list contains `work.json`, `chapters/001-1화.md`, `wiki/인물.md`; `zipBackup` output unzips (fflate `unzipSync`) to the same names; `backupFileName('나의/작품','2026-10-16') === '다음화-백업-나의_작품-20261016.zip'`. search: `'ㅅㅇ'` finds `'서윤'`; exact beats substring. schedule: settings Mon–Fri ×1, target 5; chapters 5,6,7 done unpublished; hiatus 2026-10-19–2026-10-19; today `2026-10-16` → slots `2026-10-16`=ch5, `2026-10-20`=ch6, `2026-10-21`=ch7, `bufferRunsOutOn '2026-10-22'`, warning `'비축분이 목표(5화)보다 적습니다 (현재 3화).'`; undone deadline on 2026-10-18 → warning `'마감이 2일 남았습니다: …'`. local-store (with `fake-indexeddb/auto`): save/get/clear round-trip. use-autosave (jsdom, fake timers, fake-indexeddb): typing triggers one server save after 3000 ms; save resolving `{ ok:false, error:{ code:'BAD_STATE' } }` → status `'error'` and local draft retained; rejected promise (network) → `'offline'` and `saveDraft` holds latest body; CONFLICT → `'conflict'`; while `setComposing(true)` no save fires even after 5000 ms, then fires after `setComposing(false)`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T10: Proposals — approval engine, actions, shared proposal UI

**Files:**
- Create: `src/server/proposals.ts`, `src/server/actions/proposals.ts`, `src/components/proposals/{proposal-card,proposal-list,proposal-payload-editor}.tsx`, tests `src/server/proposals.test.ts`, `src/components/proposals/proposal-card.test.tsx`

**Interfaces:**
- Consumes: T05 (`createEntry`, `updateEntry`, `findEntryByName`, `createFact`, `supersedeFact`, `createStyleCard`), T06 (`createThread`, `addThreadEvent`, `createRelation`), T04 (`setChapterSummary`), T03b (`proposal-store`, access), T01 payload schemas, T03c components.
- Produces:
  - `type ProposalView = ProposalRow & { chapterPosition: number | null; chapterTitle: string | null; groupKey: string; groupLabel: string }` (`groupKey`: for entity grouping — entry_create/entry_update/fact_create use normalized subject/entry name, relation_create the source name, thread_* the thread title, chapter_summary `'summary'`, style_card `'style'`).
  - `listProposals(db, actor, workId, o?: { status?: ProposalStatus; chapterId?: string; source?: ProposalSource; sourceRef?: string; limit?: number }): Promise<ProposalView[]>` (viewer; default pending; order by `APPLY_ORDER` then chapter position then createdAt).
  - `APPLY_ORDER: ProposalType[] = ['entry_create','entry_update','fact_create','thread_create','thread_event','relation_create','chapter_summary','style_card']`.
  - `approveProposal(db, actor, input: { proposalId: string; payloadOverride?: Record<string, unknown>; factStatus?: FactStatus; note?: string }): Promise<{ proposal: ProposalRow; targetId: string | null }>` (editor; not pending → `BAD_STATE '이미 처리된 제안입니다.'`; merged payload re-validated; applies with `{ proposerType: 'ai', proposalId }`; marks approved, `decidedBy`, `decidedAt`, `appliedTargetId`; all in one transaction).
  - Apply rules: `entry_create` → if `findEntryByName` hits (same name, any kind) merge: add new aliases, fill only empty summary/fields via `updateEntry`; else `createEntry`. `entry_update` → `updateEntry`. `fact_create` → status = `factStatus ?? suggestedStatus`; `sourceType` = `interview` for source interview, `import` for import, else `chapter`; if `supersedesFactId` and `sourceChapterId` → `supersedeFact(fromPosition = source chapter position)`, else `createFact`. `thread_create` → `createThread` (status from payload; interview-sourced → `planned`), related entries resolved by name (unresolved skipped), then each event via `addThreadEvent` in chapter-position order (invalid events skipped and listed in the returned `note`). `thread_event` → `addThreadEvent`. `relation_create` → both names via `findEntryByName`; missing → `BAD_STATE '관계에 필요한 카드(${name})가 위키에 없습니다. 카드 제안을 먼저 승인하세요.'`; `startPosition` defaults to the proposal chapter position. `chapter_summary` → `setChapterSummary`. `style_card` → `createStyleCard` (entry by name or null).
  - `rejectProposal(db, actor, input: { proposalId: string; note?: string }): Promise<ProposalRow>`.
  - `bulkApprove(db, actor, input: { proposalIds?: string[]; workId: string; sourceRef?: string; useSuggestedStatus?: boolean; defaultFactStatus?: FactStatus }): Promise<{ approved: number; failed: { proposalId: string; message: string }[] }>` (ids or all pending with that sourceRef; processes in `APPLY_ORDER`; each proposal in its own transaction; continues after failures).
  - `actions/proposals.ts`: `approveProposalAction, rejectProposalAction, bulkApproveAction, listProposalsAction({ workId, chapterId?, sourceRef?, status? })`.
  - Components: `ProposalCard({ proposal: ProposalView; workId: string; chapters: { id: string; position: number; title: string }[]; onDone?: (id: string) => void; compact?: boolean })` — shows `AiBadge`, type label, source label + chapter, human summary of payload (Korean), evidence quote block, `FactStatusSelect` for `fact_create` (default suggestedStatus), `수정` toggles `ProposalPayloadEditor`, buttons `승인` / `거절`. `ProposalList({ proposals: ProposalView[]; workId: string; chapters; grouping: 'entity' | 'chapter'; selectable?: boolean })` — groups, per-group `이 묶음 승인`, checkbox selection + `선택 승인` (bulkApprove with suggested status). `ProposalPayloadEditor({ type: ProposalType; payload: unknown; onChange: (p: Record<string, unknown>) => void })` — text inputs for the editable string fields of each type.

- [ ] **Step 1: Tests first** — `proposals.test.ts`: approve `entry_create` creates entry + change row with `proposerType 'ai'`; approving `entry_create` for an existing name merges aliases instead of duplicating; `fact_create` with `factStatus 'assumed'` stores assumed and links entry by subjectName; `fact_create` with `supersedesFactId` sets the old fact's `validToPosition`; `thread_create` with events applies valid events and skips a resolve-before-plant event; `relation_create` missing entry → BAD_STATE message containing the name; approving twice → BAD_STATE; viewer → FORBIDDEN; non-member → NOT_FOUND; `bulkApprove` with sourceRef applies entry_create before fact_create even if inserted in reverse order and reports failures without stopping; `rejectProposal` leaves the wiki unchanged. `proposal-card.test.tsx` (jsdom): renders `[가정]` toggle state for fact proposals and calls the approve action with the chosen status (mock the action module).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T11: Periodic checks (alerts) and dashboard queries

**Files:**
- Create: `src/server/alerts.ts`, `src/server/dashboard.ts`, `src/server/actions/dashboard.ts`, tests `src/server/{alerts,dashboard}.test.ts`

**Interfaces:**
- Consumes: T01, T03b, T09 `computeSchedule`, T02 `seoulToday`.
- Produces:
  - `type PeriodicAlerts = { overdueThreads: { id: string; title: string; targetPosition: number; latestPosition: number; overdueBy: number }[]; absentCharacters: { id: string; name: string; lastPosition: number; chaptersSince: number }[]; stalePendingCount: number; bufferWarning: string | null; total: number }`.
  - `getPeriodicAlerts(db: Db, workId: string, today = seoulToday()): Promise<PeriodicAlerts>` (no access check; spec §F8; absent = kind `character`, has ≥1 appearance, `latestPosition - lastPosition ≥ absenceThreshold`; stale = pending proposals older than 7 days; bufferWarning = first `computeSchedule` warning starting with `비축분`; total = sum of list lengths + (stale > 0 ? 1 : 0) + (bufferWarning ? 1 : 0)).
  - `type WorkCard = { work: WorkRow; role: Role; chapterCount: number; latestPosition: number; lastEditedAt: Date | null; pendingCount: number; openThreadCount: number; alertCount: number }`; `listWorksWithStats(db, actor, o?: { includeArchived?: boolean }): Promise<WorkCard[]>`.
  - `type WorkHome = { work: WorkRow & { role: Role }; resume: { chapterId: string; position: number; title: string } | null; latestDraft: { chapterId: string; position: number; title: string } | null; nextPosition: number; pendingCount: number; openThreads: { id: string; title: string; status: ThreadStatus; plantedPosition: number | null; targetPosition: number | null; overdue: boolean }[] /* top 5 */; alerts: PeriodicAlerts; schedule: { bufferCount: number; nextPublishDate: string | null; bufferRunsOutOn: string | null; nextDeadline: { title: string; date: string; daysLeft: number } | null }; recentChanges: ChangeRow[] /* 5 */; chapterCount: number; entryCount: number; openIssueCount: number }`; `getWorkHome(db, actor, workId): Promise<WorkHome>` (viewer).
  - `actions/dashboard.ts`: `getAlertsAction({ workId })`.

- [ ] **Step 1: Tests first** — overdue thread listed with `overdueBy 2` for target 6 and latest 8; resolved thread never listed; character absent for 10 chapters listed, 9 not (threshold 10); character never appearing not listed; stale pending counted only after 7 days; `listWorksWithStats` counts pending and open threads per work; `getWorkHome` returns `latestDraft` = highest-position draft and `nextPosition` = latest+1; non-member → NOT_FOUND.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T12a: Extraction schema and proposal mapping (Wave 2)

**Files:**
- Create: `src/ai/extraction.ts`, test `src/ai/extraction.test.ts`

**Interfaces:**
- Consumes: T01 (`ENTRY_KINDS`, `FACT_STATUSES`, `NewProposal`, `ProposalSource`, `EntryKind`), T02 `stripJosa`.
- Produces: the `src/ai/extraction.ts` items described in Task T12's Produces list (`ExtractionSchema`, `Extraction`, `ExtractionContext`, `PendingThreadEvent`, `extractionToProposals`). Tests: the "extraction:" cases in T12 Step 1. Pure module (no DB, no AI).

### Task T12: Interview (F1) — AI tasks and service

**Files:**
- Create: `src/ai/tasks/interview-question.ts`, `src/ai/tasks/interview-extract.ts`, `src/server/interview.ts`, `src/server/actions/interview.ts`, tests `src/ai/tasks/interview.test.ts`, `src/server/interview.test.ts` (`src/ai/extraction.ts` comes from T12a)

**Interfaces:**
- Consumes: T08 (`AiTaskDef`, `runAiTask`, `getAiClient`), T12a (`ExtractionSchema`, `extractionToProposals`), T03b `insertProposals`, T05 `listEntries` (or direct queries), T02 `stripJosa`, `findMentions`.
- Produces:
  - `src/ai/extraction.ts` (built in T12a; shared with T13/T16): `ExtractionSchema` (zod, exact):
    ```ts
    z.object({
      summary: z.string().nullable(),
      entries: z.array(z.object({ name: z.string(), kind: z.enum(ENTRY_KINDS), aliases: z.array(z.string()), summary: z.string(), fields: z.array(z.object({ key: z.string(), value: z.string() })) })),
      facts: z.array(z.object({ subjectName: z.string(), content: z.string(), evidence: z.string(), suggestedStatus: z.enum(FACT_STATUSES), supersedesFactRef: z.string().nullable() })),
      threads: z.array(z.object({ title: z.string(), description: z.string(), kind: z.enum(['planted','developed','resolved']), evidence: z.string(), existingThreadRef: z.string().nullable(), targetChapterPosition: z.number().int().nullable() })),
      relations: z.array(z.object({ sourceName: z.string(), targetName: z.string(), kind: z.string(), description: z.string(), evidence: z.string() })),
    })
    ```
    `type Extraction = z.infer<typeof ExtractionSchema>`; `type ExtractionContext = { source: ProposalSource; sourceRef: string | null; chapterId: string | null; chapterPosition: number | null; existingEntries: { id: string; name: string; aliases: string[]; kind: EntryKind }[]; threadRefs: Map<string, { id: string; title: string }>; factRefs: Map<string, { id: string }>; pendingThreadTitles?: Set<string> }`; `type PendingThreadEvent = { title: string; kind: 'developed' | 'resolved'; evidence: string }`; `extractionToProposals(x: Extraction, ctx: ExtractionContext): { proposals: NewProposal[]; pendingThreadEvents: PendingThreadEvent[] }` — rules: entries whose stripped name/alias matches an existing entry → skipped (their facts still become fact_create with that subject); new entries → `entry_create` (fields array → record); facts → `fact_create` (`entryId` from existing match else null; `supersedesFactId` from `factRefs`; `sourceChapterId` = ctx.chapterId); threads `planted` → `thread_create` (status `planned` when `source === 'interview'`, else `planted` with `plantedChapterId`, `events: []`); threads `developed`/`resolved` with a valid `existingThreadRef` → `thread_event`; with an unknown/null ref but a title (trimmed, exact) in `ctx.pendingThreadTitles` → pushed to `pendingThreadEvents` (T16 attaches them to its pending `thread_create`); otherwise dropped; relations → `relation_create` (`directed false`, `startPosition` = ctx.chapterPosition); `summary` non-empty and chapterId set → `chapter_summary`; empty strings trimmed; duplicates (same type + same normalized key) removed.
  - `interviewQuestionTask: AiTaskDef<InterviewQuestionInput, { topic: string; question: string; rationale: string }>` with `InterviewQuestionInput = { work: { title: string; genre: string; logline: string; synopsis: string }; wiki: { counts: Record<EntryKind, number>; entryNames: string[]; openThreadTitles: string[] }; history: { topic: string; question: string; answer: string | null; skipped: boolean }[] }`; effort `low`, maxTokens 2000. System prompt (exact):
    ```
    당신은 웹소설 작가의 기획을 돕는 인터뷰어다. 작가의 설정 위키를 채우기 위해 질문을 한 번에 하나만 한다.
    규칙:
    - 이미 묻거나 건너뛴 주제는 반복하지 않는다.
    - 위키에서 비어 있는 부분(주인공, 주요 인물, 세계관 규칙, 장소, 갈등, 떡밥, 결말 방향, 문체)을 우선한다.
    - 질문은 구체적이고 답하기 쉽게 한두 문장으로 쓴다. 예시 답을 늘어놓지 않는다.
    - topic에는 주제 이름을, rationale에는 이 질문이 위키의 어느 부분을 채우는지 한 문장으로 쓴다.
    - 모든 출력은 한국어로 쓴다.
    ```
    Prompt layout: `<work>` (title/genre/logline/synopsis), `<wiki>` (counts by Korean kind label, names, open thread titles), `<history>` (each Q, answer or `(건너뜀)`). Fake: topics in order `['주인공','주요 인물','세계관 규칙','주요 장소','중심 갈등','떡밥','결말 방향','문체']`, first topic not in history, fixed question per topic (e.g. 주인공 → `'주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?'`); after all → topic `'자유'`, question `'더 정리해 두고 싶은 설정이 있나요?'`.
  - `interviewExtractTask: AiTaskDef<InterviewExtractInput, Extraction>` with `InterviewExtractInput = { topic: string; question: string; answer: string; known: { name: string; kind: EntryKind; aliases: string[] }[] }`; effort `medium`, maxTokens 8000. System prompt (exact):
    ```
    당신은 작가의 인터뷰 답변을 설정 위키 후보로 정리한다.
    규칙:
    - 답변에 담긴 내용만 정리한다. 지어내지 않는다.
    - 작가가 단정적으로 말한 것은 suggestedStatus "confirmed", "아마", "~할 수도"처럼 망설이며 말한 것은 "undecided", 답변에서 추론한 것은 "assumed"로 둔다.
    - 이미 있는 카드(<known>)는 같은 이름을 쓰고, 새 대상만 entries에 넣는다.
    - evidence에는 답변 문장을 그대로 인용한다.
    - 앞으로 풀 비밀이나 복선은 threads에 kind "planted"로 넣는다. existingThreadRef와 targetChapterPosition은 답변에 회차가 나오지 않으면 null이다.
    - summary는 null, supersedesFactRef는 null로 둔다.
    - 모든 출력은 한국어로 쓴다.
    ```
    Fake: the first token of the answer (≥2 Hangul chars, `stripJosa`) as subject; if topic is `주인공`/`주요 인물` and that name is not known → one `entry_create` (kind `character`); always one `fact_create` with content = first sentence of the answer, status `assumed`, evidence = same sentence; topic `떡밥` → one planted thread titled with the first 20 chars.
  - `interview.ts`: `getInterviewState(db, actor, workId): Promise<{ session: InterviewSessionRow | null; turns: InterviewTurnRow[]; current: InterviewTurnRow | null }>` (current = last turn with no answer and not skipped); `startInterview(db, actor, workId): Promise<InterviewSessionRow>` (reuses active session); `askNextQuestion(db, actor, sessionId, client?): Promise<InterviewTurnRow>` (editor; existing unanswered turn → return it); `answerTurn(db, actor, input: { turnId: string; answer: string }, client?): Promise<{ turn: InterviewTurnRow; proposals: ProposalRow[] }>` (empty answer → `VALIDATION '답을 입력하거나 건너뛰기를 누르세요.'`; proposals source `interview`, sourceRef turnId); `skipTurn(db, actor, turnId)`; `completeInterview(db, actor, sessionId)`.
  - `actions/interview.ts`: `startInterviewAction, askNextQuestionAction, answerTurnAction, skipTurnAction, completeInterviewAction`.

- [ ] **Step 1: Tests first** — extraction: existing name match skips entry_create but keeps the fact with entryId; unknown thread ref dropped; summary becomes chapter_summary only with a chapterId; duplicate facts deduped. tasks: fakes validate against schemas; `buildPrompt` contains `<history>` and `(건너뜀)` for skipped turns. interview service (FakeAiClient): start → ask → answer creates pending proposals with sourceRef = turnId; skip → next question has a different topic; viewer cannot ask → FORBIDDEN.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T13: Chapter check (F7), chapter extraction, proofreading (F14)

**Files:**
- Create: `src/ai/tasks/chapter-extract.ts`, `src/ai/tasks/continuity-check.ts`, `src/ai/tasks/proofread.ts`, `src/server/chapter-check.ts`, `src/server/actions/checks.ts`, tests `src/ai/tasks/{chapter-extract,continuity-check,proofread}.test.ts`, `src/server/chapter-check.test.ts`

**Interfaces:**
- Consumes: T08 (`runAiTask`, `buildContextPack`, `renderContextPack`, `resolveRefs`), T12a (`ExtractionSchema`, `extractionToProposals`), T07 (`replaceOpenIssues`, `NewIssue`), T03b (`insertProposals`, `deletePendingProposals`), T02 (`locateQuote`, `splitSentences`, `findNamingIssues`, `ruleBasedSpellcheck`, `findMentions`).
- Produces:
  - `chapterExtractTask: AiTaskDef<ChapterExtractInput, Extraction>`; `ChapterExtractInput = { chapterText: string; chapterPosition: number; chapterTitle: string; known: { name: string; kind: EntryKind; aliases: string[] }[]; openThreads: { ref: string; title: string; description: string }[]; knownFacts: { ref: string; subjectName: string; content: string }[]; model?: string }`; effort `medium`, maxTokens 16000; `model` passthrough (import uses `getImportModel()`). System prompt (exact):
    ```
    당신은 장기 연재 웹소설의 설정 기록 담당자다. 주어진 회차 원고에서 설정 위키에 남길 후보를 뽑는다.
    규칙:
    - 원고에 실제로 쓰인 내용만 뽑는다. 원고에 없는 내용을 지어내지 않는다.
    - evidence에는 원고 문장을 한 글자도 바꾸지 말고 그대로 인용한다(한 문장, 120자 이내).
    - 원고에 직접 쓰인 사실은 suggestedStatus "confirmed", 원고에서 추론한 것은 "assumed"로 둔다.
    - 이미 알려진 대상(<known>)은 같은 이름을 쓰고, entries에는 목록에 없는 새 인물·장소·조직·물건·규칙·사건·용어만 넣는다.
    - facts에는 나중에 설정 충돌을 찾는 데 쓸 구체적인 정보(외모, 능력, 나이, 관계, 소속, 과거사, 세계의 규칙, 약속)를 우선한다. 사소한 행동 묘사는 넣지 않는다.
    - 이 회차에서 상태가 바뀐 사실(<known_facts>의 F ref와 다른 새 상태)은 supersedesFactRef에 그 ref를 넣는다.
    - threads는 독자에게 의문이나 기대를 남기고 아직 풀리지 않은 요소다. <open_threads>의 떡밥이 이 회차에서 진전되거나 풀리면 kind를 "developed" 또는 "resolved"로 하고 existingThreadRef에 그 T ref를 넣는다. 새로 심어진 떡밥은 kind "planted", existingThreadRef null.
    - relations는 인물·장소·조직 사이의 관계(가족, 연인, 적대, 동료, 소속, 스승 등)가 드러날 때만 넣는다.
    - summary는 이 회차의 핵심 사건을 3문장 이내로 요약한다.
    - 모든 출력은 한국어로 쓴다.
    ```
    Prompt layout: `<known>`, `<known_facts>`, `<open_threads>`, `<manuscript position="N" title="…">`. Fake: summary = first sentence (≤ 80 chars); new entries = Hangul words of 2–4 chars that appear ≥ 3 times directly followed by `은/는/이/가` and are not known (max 5, kind `character`); for every known or new name mentioned (via `findMentions`), one `fact_create` `'${N}화에 등장한다.'` status `confirmed`, evidence = first sentence containing the name; no threads/relations.
  - `continuityCheckTask: AiTaskDef<ContinuityInput, ContinuityOutput>`; `ContinuityInput = { chapterText: string; chapterPosition: number; chapterTitle: string; pack: ContextPack }`; `ContinuityOutput = { issues: { quote: string; kind: IssueKind; severity: Severity; factRef: string | null; entryRef: string | null; wikiExcerpt: string; explanation: string; suggestion: string }[] }`; effort `high`, maxTokens 16000. System prompt (exact):
    ```
    당신은 장기 연재 웹소설의 설정 오류(오기)를 찾는 교정자다. <wiki>는 작가가 승인한 설정 위키이고, <manuscript>는 점검할 회차 원고다.
    규칙:
    - <wiki>의 사실(F ref)이나 카드(E ref)와 원고 문장이 어긋나는 곳만 지적한다. 위키 근거가 없는 지적은 하지 않는다.
    - quote에는 문제가 되는 원고 문장을 한 글자도 바꾸지 말고 그대로 옮긴다.
    - wikiExcerpt에는 근거가 된 위키 문구를 그대로 옮기고, factRef 또는 entryRef에 그 ref를 넣는다.
    - 위키의 사실에 "N화부터", "~N화" 같은 유효 범위가 있으면 이 회차 시점에 유효한 것만 기준으로 삼는다. 이야기 속에서 상태가 바뀌는 전개 자체는 오기가 아니다. 설명 없이 위키와 어긋날 때만 지적한다.
    - [가정]이나 [미정] 사실과 어긋나면 severity를 "low"로 두고 explanation에 "가정/미정 설정과 다릅니다"라고 밝힌다.
    - 표기 규칙(<naming>) 위반, 심지 않은 떡밥을 회수하는 문제, 시간선 모순도 찾는다.
    - suggestion에는 원고를 고친 문장을 쓰거나, 위키를 고쳐야 할 수도 있다고 제안한다.
    - 확신이 없으면 지적하지 않는다. 지적할 것이 없으면 빈 배열을 돌려준다.
    - 모든 출력은 한국어로 쓴다.
    ```
    Prompt: `<wiki>` = `renderContextPack(pack)`, then `<manuscript position="N" title="…">`. `postProcess`: drop issues whose quote cannot be located (`locateQuote`); map refs via `resolveRefs`, unknown refs → null; drop issues with neither a fact nor an entry; dedupe by located range. Fake: for each pack fact containing `왼손` whose subject is mentioned in a sentence containing `오른손` (and the symmetric case), emit one `contradiction` issue (severity `medium`) quoting that sentence; also if a fact matches `/(\d+)\s*살/` and a sentence mentioning the same subject contains a different `N살`, emit one.
  - `proofreadTask: AiTaskDef<{ text: string }, { suggestions: { quote: string; replacement: string; kind: 'spelling'|'spacing'|'grammar'|'awkward'; reason: string }[] }>`; effort `medium`, maxTokens 16000. System prompt (exact):
    ```
    당신은 한국어 웹소설 교정자다. 원고에서 맞춤법, 띄어쓰기, 문법 오류와 어색한 표현을 찾아 고칠 표현을 제안한다.
    규칙:
    - quote에는 고칠 부분을 원고 그대로, 가능한 한 짧게(어절이나 구) 옮긴다.
    - replacement에는 quote를 대신할 고친 표현을 쓴다.
    - 대사 속 구어체, 사투리, 인물 말투, 의도된 비문은 고치지 않는다. 문체를 바꾸는 제안은 하지 않는다.
    - kind는 spelling(맞춤법), spacing(띄어쓰기), grammar(문법), awkward(어색한 표현) 중 하나다.
    - reason에는 왜 고치는지 한 문장으로 쓴다.
    - 모든 출력은 한국어로 쓴다.
    ```
    `postProcess` drops unlocatable quotes and no-op replacements. Fake returns `{ suggestions: [] }`.
  - `chapter-check.ts`: `type ChapterCheckResult = { issues: IssueRow[]; proposals: ProposalRow[]; runIds: string[]; namingIssueCount: number }`; `runChapterCheck(db, actor, input: { chapterId: string }, client?): Promise<ChapterCheckResult>` (editor; loads chapter + work; `buildContextPack(text, position)`; in parallel `runAiTask(continuityCheckTask)` and `runAiTask(chapterExtractTask)` with `known` = all non-archived entries, `openThreads` = pack threads, `knownFacts` = pack facts; naming hits → `NewIssue` kind `naming`, severity `low`, wikiExcerpt `표기 규칙: ${canonical}`, explanation `'${variant}'는 '${canonical}'로 통일하기로 한 표기입니다.`, suggestion = sentence with variant replaced; AI issues → `NewIssue` with located offsets; `replaceOpenIssues`; `deletePendingProposals({ workId, source: 'post_chapter', chapterId })` then `insertProposals(extractionToProposals(…, source 'post_chapter', sourceRef runId).proposals)`; skip `fact_create` proposals whose content exactly equals an existing non-archived fact of the same entry).
    `type SpellChecker = { id: 'rule' | 'ai' | string; check(text: string): Promise<ProofreadSuggestion[]> }` — `runProofread` composes `ruleSpellChecker` (wraps `ruleBasedSpellcheck`) and, when `useAi`, an AI checker built on `proofreadTask`; a future external checker (e.g. Bareun) plugs in as another `SpellChecker`.
    `type ProofreadSuggestion = { source: 'rule' | 'ai'; quote: string; replacement: string; kind: 'spelling'|'spacing'|'grammar'|'awkward'; reason: string; start: number; end: number }`; `runProofread(db, actor, input: { chapterId: string; text?: string; useAi: boolean }, client?): Promise<{ suggestions: ProofreadSuggestion[]; runId: string | null }>` (editor; rule suggestions always; AI ones when `useAi`; overlapping AI suggestions that collide with a rule suggestion are dropped; sorted by start).
  - `actions/checks.ts`: `runChapterCheckAction({ chapterId })`, `runProofreadAction({ chapterId, text?, useAi })`.

- [ ] **Step 1: Tests first** — continuity postProcess: unlocatable quote dropped; unknown factRef nulls out and, without entryRef, drops the issue; valid ref maps to the fact id and the quote gets offsets. fakes validate. `chapter-check.test.ts` (FakeAiClient): entry '서윤' + fact `'서윤은 왼손잡이다.'`, chapter text `'서윤은 오른손으로 검을 쥐었다.'` → one open `contradiction` issue with `factId` set and `quote` equal to that sentence; naming rule `레이아`/[`레이야`] + text containing `레이야가` → a `naming` issue; re-running replaces open issues but keeps a dismissed one; post_chapter proposals are replaced on re-run; a fact valid only to position 1 is not in the pack for chapter 2 (no issue); viewer → FORBIDDEN. `runProofread` with `useAi false` returns the rule suggestion for `'안 되요.'` with correct offsets.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T14: Reader simulation (F11), direction advice (F12), style cards suggestion and drafting (F13)

**Files:**
- Create: `src/ai/tasks/{reader-sim,direction-advice,style-suggest,draft-chapter}.ts`, `src/ai/personas.ts`, `src/server/ai-features.ts`, `src/server/actions/ai-features.ts`, `src/app/api/works/[workId]/draft/route.ts`, tests `src/ai/tasks/{reader-sim,direction-advice,style-suggest,draft-chapter}.test.ts`, `src/server/ai-features.test.ts`

**Interfaces:**
- Consumes: T08, T04 (`createChapter`, `getLatestPosition`), T05 (`listStyleCards`), T06 (`listThreads`), T03b (`insertProposals`, session), T02.
- Produces:
  - `personas.ts`: `type Persona = { id: string; name: string; description: string }`; `READER_PERSONAS: Persona[]` = `reader-novice 신규 유입 독자 — 이번 화부터 처음 읽는다. 설명 없는 인물과 용어에 헷갈린다.`, `reader-binge 정주행 독자 — 1화부터 꼼꼼히 읽어 왔다. 설정 오류와 늘어지는 전개에 민감하다.`, `reader-casual 가볍게 보는 독자 — 출퇴근길 휴대폰으로 빠르게 넘긴다. 긴 설명과 느린 도입에서 이탈한다.`, `reader-genre 장르 매니아 — 장르 클리셰를 잘 안다. 뻔한 전개에 지루해하고 신선한 반전을 원한다.`.
  - `readerSimTask` output `ReaderSimResult = { personas: { personaId: string; rating: number; dropOffRisk: 'low'|'medium'|'high'; overall: string; moments: { quote: string; reaction: 'confused'|'bored'|'excited'|'dropoff'|'moved'; comment: string }[] }[]; summary: string }`; input `{ chapterText: string; chapterPosition: number; chapterTitle: string; previousSummaries: { position: number; summary: string }[]; work: { title: string; genre: string; logline: string }; personas: Persona[] }`; effort `medium`, maxTokens 16000; postProcess drops unlocatable moment quotes and clamps rating to 1–5. System prompt (exact):
    ```
    당신은 웹소설 플랫폼의 여러 독자 페르소나를 연기해 회차를 읽고 반응을 남긴다.
    규칙:
    - <personas>의 페르소나마다 그 성향대로 읽고, 각자 personaId로 답한다. 같은 반응을 복사하지 않는다.
    - moments의 quote는 원고 문장을 그대로 인용한다.
    - reaction은 confused(헷갈림), bored(지루함), excited(몰입), dropoff(이탈 위험), moved(감동) 중 하나다.
    - rating은 1~5 정수, dropOffRisk는 low, medium, high 중 하나다.
    - 칭찬과 문제점을 모두 구체적으로 쓰고, 작가가 고칠 수 있는 지점을 짚는다.
    - 모든 출력은 한국어로 쓴다.
    ```
  - `directionAdviceTask` output `AdviceResult = { options: { title: string; summary: string; beats: string[]; usesThreads: string[]; involvedCharacters: string[]; risk: string }[]; warnings: string[]; recommendedIndex: number; recommendationReason: string }`; input `{ work: { title: string; genre: string; logline: string; synopsis: string }; latestPosition: number; threads: { title: string; description: string; status: ThreadStatus; plantedPosition: number | null; targetPosition: number | null; overdue: boolean }[]; characters: { name: string; summary: string; lastPosition: number | null; keyFacts: string[] }[]; recentSummaries: { position: number; title: string; summary: string }[] }`; effort `high`, maxTokens 16000; postProcess keeps at most 3 options and clamps `recommendedIndex` into range. System prompt (exact):
    ```
    당신은 장기 연재 웹소설의 편집자다. 열린 떡밥, 인물 상태, 최근 전개를 보고 다음 전개 선택지를 제안한다.
    규칙:
    - 선택지는 정확히 3개이고, 서로 방향이 분명히 달라야 한다.
    - 각 선택지는 위키의 떡밥(usesThreads: 떡밥 제목)과 인물(involvedCharacters: 카드 이름)을 활용한다. 위키에 없는 대상을 새로 만들지 말고, 필요하면 risk에 "새 인물 필요"처럼 적는다.
    - beats에는 다음 화에서 일어날 일을 순서대로 3~5개 쓴다.
    - warnings에는 회수 목표가 지난 떡밥, 오래 등장하지 않은 주요 인물처럼 작가가 놓치기 쉬운 점을 쓴다.
    - recommendedIndex에 가장 추천하는 선택지 번호(0~2)를, recommendationReason에 그 이유를 쓴다.
    - 결정은 작가가 한다. 단정하지 말고 제안하는 말투로 쓴다.
    - 모든 출력은 한국어로 쓴다.
    ```
  - `styleSuggestTask` output `{ name: string; tone: string; rules: string; examples: string }`; input `{ entryName: string; samples: string[] }`; effort `medium`, maxTokens 4000. System prompt (exact):
    ```
    당신은 웹소설 인물의 말투를 분석해 문체 카드를 만든다.
    규칙:
    - <samples>의 대사만 근거로 분석한다. 지어내지 않는다.
    - name은 "인물 이름 말투" 형식으로 쓴다.
    - tone에는 전체적인 말투 인상을 한 문장으로 쓴다.
    - rules에는 말투 규칙을 한 줄에 하나씩 쓴다(어미, 존댓말과 반말, 자주 쓰는 표현, 문장 길이, 쓰지 않는 표현).
    - examples에는 샘플 대사 중 그 인물다운 것 3~5줄을 그대로 옮긴다.
    - 모든 출력은 한국어로 쓴다.
    ```
  - `draft-chapter.ts`: `DRAFT_SYSTEM` (exact below), `buildDraftPrompt(input: { instructions: string; targetChars: number; styleCards: { name: string; entryName: string | null; tone: string; rules: string; examples: string }[]; packText: string; previousSummary: string | null; previousTail: string | null; chapterLabel: string }): string`, `fakeDraft(input): string` (demo: `'(데모 초안) '` + the instructions turned into ~6 short paragraphs, ≥ 600 chars).
    ```
    당신은 웹소설 작가의 초안 작성을 돕는 보조 작가다. 작가의 지시와 설정 위키, 문체 카드를 따라 회차 초안을 쓴다.
    규칙:
    - 작가의 지시(<instructions>)에 있는 사건만 쓴다. 위키에 없는 중요한 설정(새 능력, 새 관계, 죽음 등)을 지어내지 않는다.
    - 위키의 사실과 어긋나지 않게 쓰고, 표기 규칙을 지킨다.
    - 인물 대사는 그 인물의 문체 카드(말투, 규칙, 예시)를 따른다. 인물마다 목소리가 구분되게 한다.
    - 서술은 작품 문체 카드를 따른다.
    - 웹소설 문단 호흡(짧은 문단, 대사 중심)으로 쓴다.
    - 목표 분량에 가깝게 쓴다.
    - 제목이나 설명 없이 본문만 출력한다.
    ```
  - `ai-features.ts`: `runReaderSimulation(db, actor, input: { chapterId: string; personaIds?: string[] }, client?): Promise<{ runId: string; result: ReaderSimResult }>` (editor); `listReaderSimRuns(db, actor, workId, o?: { chapterId?: string })`; `runDirectionAdvice(db, actor, input: { workId: string }, client?): Promise<{ runId: string; result: AdviceResult }>` (editor); `listAdviceRuns(db, actor, workId)`; `suggestStyleCard(db, actor, input: { workId: string; entryId: string }, client?): Promise<ProposalRow>` (editor; samples = up to 40 dialogue lines (`"…"`/`“…”`/`「…」`) from lines that also mention the entry name or alias, scanning chapters newest first; fewer than 3 samples → `BAD_STATE '이 인물의 대사를 원고에서 3줄 이상 찾지 못했습니다.'`; proposal type `style_card`, source `style`); `startDraft(db, actor, input: { workId: string; chapterId?: string | null; instructions: string; targetChars?: number; entryIds: string[] }, client?): Promise<{ runId: string; textStream: AsyncIterable<string>; done: Promise<string> }>` (editor; empty instructions → `VALIDATION '무슨 일이 일어나야 하는지 적어 주세요.'`; style cards = work-level (entryId null) + selected entries; pack built from instructions text + selected entries via `extraEntryIds`; previous chapter = the chapter before `chapterId` or the latest; tail = last 1500 chars).
  - `actions/ai-features.ts`: `runReaderSimulationAction({ chapterId, personaIds? })`, `runDirectionAdviceAction({ workId })`, `suggestStyleCardAction({ workId, entryId })`, `createChapterFromDraftAction({ workId, runId, title? })` (creates a chapter whose body is the run's stored text with version source `ai_draft`).
  - Route `POST /api/works/[workId]/draft` (`maxDuration = 300`, runtime nodejs): body `{ chapterId?, instructions, targetChars?, entryIds }`; auth via `getSessionUser` (401 JSON `{ error: '로그인이 필요합니다.' }`), AppError → JSON `{ error: message }` with 400/403/404/429 (AI_LIMIT); success → `text/plain; charset=utf-8` stream with header `X-Run-Id`.

- [ ] **Step 1: Tests first** — tasks: fakes validate; reader-sim postProcess clamps rating 7 → 5 and drops unlocatable quotes; advice clamps index 5 → 2. service (FakeAiClient): reader-sim stores an `ai_runs` row (task `reader-sim`, chapterId) and `listReaderSimRuns` returns it; advice result has 3 options; `suggestStyleCard` with 3 dialogue lines `"…"` mentioning '서윤' creates a pending `style_card` proposal, with 2 lines → BAD_STATE; `startDraft` streams the fake text and stores `{ text }`; `createChapterFromDraftAction` logic covered by calling `createChapter` with the stored text (service-level test).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T15: Export payload service and route

**Files:**
- Create: `src/server/exports.ts`, `src/app/api/works/[workId]/export/route.ts`, test `src/server/exports.test.ts`

**Interfaces:**
- Consumes: T01 `ExportPayload`, T03b access.
- Produces: `buildExportPayload(db, actor, workId): Promise<ExportPayload>` (owner; includes archived rows too, everything scoped to the work; `exportedAt` ISO). Route `GET /api/works/[workId]/export` → 200 JSON payload; 401/403/404 JSON `{ error }`.

- [ ] **Step 1: Tests first** — payload contains all tables' rows for that work only (create rows in two works); editor → FORBIDDEN; `format 'daeumhwa-backup'`, `version 1`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T16: Manuscript import jobs (F6) — service, advance route, Inngest

**Files:**
- Create: `src/server/imports.ts`, `src/server/actions/imports.ts`, `src/inngest/client.ts`, `src/inngest/functions.ts`, `src/app/api/inngest/route.ts`, `src/app/api/import-jobs/[jobId]/route.ts`, `src/app/api/import-jobs/[jobId]/advance/route.ts`, test `src/server/imports.test.ts`

**Interfaces:**
- Consumes: T04 `createChaptersBulk`, T08 (`runAiTask`, `getImportModel`, `AppError AI_LIMIT`), T13 `chapterExtractTask`, T12a `extractionToProposals`, T03b (`insertProposals`, access).
- Produces:
  - `createImportJob(db, actor, input: { workId: string; fileName: string; totalChapters: number }): Promise<ImportJobRow>` (editor; status `uploading`; totalChapters 1–2000 else `VALIDATION '회차 수가 올바르지 않습니다.'`).
  - `appendImportChapters(db, actor, input: { jobId: string; chapters: { title: string; body: string }[] }): Promise<{ appended: number; received: number }>` (editor; status must be `uploading` → else `BAD_STATE`; > 50 chapters → `VALIDATION '한 번에 50화까지 올릴 수 있습니다.'`; creates chapters (status `done`, version source `import`) and appends ids to `chapterIds`; exceeding `totalChapters` → `VALIDATION`).
  - `startImportJob(db, actor, jobId): Promise<ImportJobRow>` (editor; from `uploading` requires `chapterIds.length === totalChapters`; from `paused`/`error` resumes; sets `running`, `startedAt`, `runner = isInngestEnabled() ? 'inngest' : 'client'`; when inngest → `inngest.send({ name: 'import/run', data: { jobId } })`).
  - `advanceImportJob(db: Db, jobId: string, o?: { client?: AiClient; userId?: string }): Promise<{ status: ImportJobStatus; processed: number; total: number; done: boolean; message: string | null }>` — no access check (callers check). Algorithm: load job; if status ≠ `running` → return current; chapter = `chapterIds[cursor]`; known = existing non-archived entries + `state.knownEntities`; open threads = existing open threads (refs `T1…`) — pending thread titles from `state.threadTitles`; run `chapterExtractTask` with `model: getImportModel()` and meta `{ userId: job.createdBy, workId, chapterId }`; on `AI_LIMIT` → status `paused`, `error = '오늘 AI 사용량 한도에 도달해 일시정지했습니다. 내일 이어서 진행하세요.'`; on other errors → status `error` with message; on success build `{ proposals, pendingThreadEvents }` via `extractionToProposals` (source `import`, sourceRef jobId, `pendingThreadTitles` = `state.threadTitles`); each pending thread event is appended (with this `chapterId`) to the `events` of the matching pending `thread_create` proposal of this job (update its payload); titles of new `thread_create` proposals are added to `state.threadTitles` and new entry names to `state.knownEntities`; in one transaction: `UPDATE import_jobs SET cursor = cursor+1, processed_chapters = processed_chapters+1, proposal_count = …, state = … WHERE id = $1 AND cursor = $expected AND status = 'running'` — if 0 rows → rollback (another call won) and return the fresh status; insert proposals; when cursor reaches total → status `done`, `finishedAt`.
  - `pauseImportJob(db, actor, jobId)`, `cancelImportJob(db, actor, jobId)` (cancel keeps created chapters and proposals), `getImportJob(db, actor, jobId)`, `listImportJobs(db, actor, workId)`.
  - `inngest/client.ts`: `export const inngest = new Inngest({ id: 'daeumhwa' })`, `isInngestEnabled(): boolean` (`!!process.env.INNGEST_EVENT_KEY || process.env.INNGEST_DEV === '1'`). `inngest/functions.ts`: `importRun` (event `import/run`): loop up to 2000 times `step.run('advance-' + i, () => advanceImportJob(getDb(), jobId))`, stop when `done` or status not `running`. `api/inngest/route.ts`: `serve({ client: inngest, functions: [importRun] })` from `inngest/next` (verify v4 API in node_modules).
  - Routes (`maxDuration = 300`): `GET /api/import-jobs/[jobId]` → job status JSON (viewer); `POST /api/import-jobs/[jobId]/advance` → editor check, then `advanceImportJob`, JSON result; errors JSON `{ error }` with status codes as in T14's route.
  - `actions/imports.ts`: `createImportJobAction, appendImportChaptersAction, startImportJobAction, pauseImportJobAction, cancelImportJobAction`.

- [ ] **Step 1: Tests first** (FakeAiClient) — full flow: create (3) → append 3 → start → advance ×3 → status `done`, `processedChapters 3`, proposals with sourceRef jobId; append 51 → VALIDATION; start before all uploaded → BAD_STATE; concurrent advance (two `Promise.all` calls) processes each chapter once (cursor ends at 1 after one round, no duplicate proposals); client throwing `AppError('AI_LIMIT', …)` → status `paused` with the exact Korean message, and `startImportJob` resumes; extraction resolving a thread planted in chapter 1 and resolved in chapter 3 ends as one `thread_create` proposal with one `resolved` event.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; typecheck own files.

---

### Task T17: Works dashboard, work home, write redirect, chapters management (F17, F8, F15 summary)

**Files:**
- Create/Modify: `src/app/(app)/works/page.tsx` (replace), `src/app/(app)/works/[workId]/page.tsx` (replace), `src/app/(app)/works/[workId]/write/page.tsx`, `src/app/(app)/works/[workId]/chapters/page.tsx`, `src/components/works/{work-card,resume-banner,home-panels}.tsx`, `src/components/chapters/chapter-table.tsx`

**Interfaces:**
- Consumes: T11 (`listWorksWithStats`, `getWorkHome`), T04 (`getResumePoint`, `listChapters`, `openNextChapter`, chapter actions), T03c components.
- Produces: pages only.
- [ ] **Step 1: `/works`:** `ResumeBanner` (`이어서 쓰기: {작품} · {chapterLabel}` → that chapter) from `getResumePoint`; grid of `WorkCard` (title, genre, `{chapterCount}화`, `승인 대기 N`, `열린 떡밥 N`, `경고 N` badge, last edited) ; archived works under a collapsible `보관한 작품`.
- [ ] **Step 2: `/works/[workId]`:** header with `다음 화 쓰기` (calls `openNextChapterAction` then navigates) and, if `latestDraft`, `이어 쓰기: …`; panels: 승인 대기 (count + link), 열린 떡밥 (top 5, overdue in red `회수 목표 지남`), 주기 점검 (overdue threads `‘{title}’ 회수 목표 {target}화가 지났습니다 (현재 {latest}화).`, absent characters `‘{name}’이(가) {n}화째 등장하지 않았습니다.`, stale `7일 넘게 기다리는 제안이 {n}건 있습니다.`, buffer warning), 일정 (비축 N화, 다음 연재일, 소진 예상일, 다음 마감), 최근 변경 (5, link to 이력). Empty work → `EmptyState` offering 인터뷰 / 가져오기 / 바로 쓰기.
- [ ] **Step 3: `/works/[workId]/write`:** server redirect: resume point chapter of this work if any and not archived → that chapter; else `openNextChapter` → chapter page (viewers without edit rights → `/works/[workId]/chapters`).
- [ ] **Step 4: `/works/[workId]/chapters`:** `ChapterTable`: columns 회차 (`chapterLabel`, link), 상태 (toggle 초안/완료), 글자 수 (공백 포함), 연재일 (date input → `setChapterPublishedOnAction`), 수정일, actions (위/아래 이동, 보관/복원 with `ConfirmButton`); `새 회차` button; toggle `보관한 회차 보기`. Viewer role → read-only.
- [ ] **Step 5: Verify:** `pnpm typecheck` (own paths), `pnpm lint` (own paths: `pnpm eslint <paths>`).

---

### Task T18: Writing screen core — editor, autosave, versions page

**Files:**
- Create: `src/app/(app)/works/[workId]/chapters/[chapterId]/page.tsx`, `src/app/(app)/works/[workId]/chapters/[chapterId]/history/page.tsx`, `src/components/writing/{types,writing-workspace,manuscript-editor,highlight-layer,editor-toolbar,recovery-dialog,conflict-dialog,version-list,version-diff}.tsx` (`types.ts`), `src/components/writing/side-panel.tsx` (placeholder; T19 replaces), test `src/components/writing/manuscript-editor.test.tsx`

**Interfaces:**
- Consumes: T04 (getChapter, listChapters, versions, actions/manuscript), T05 (`listEntries`, `listNamingRules`), T06 (`listThreads`), T07 (`listIssues`, `listComments`), T03b (`countPendingProposals`), T09 (`useAutosave`, `getTextWorker`), T02 (`countChars`, labels), `isDemoMode`.
- Produces (T19 depends on these exact names):
  ```ts
  // src/components/writing/types.ts
  export type HighlightKind = 'issue' | 'spelling' | 'comment' | 'reader' | 'naming' | 'search'
  export type Highlight = { id: string; start: number; end: number; kind: HighlightKind; active?: boolean }
  export type WritingData = {
    workId: string; workTitle: string; role: Role; demo: boolean; targetChars: number
    chapter: ChapterRow; chapters: { id: string; position: number; title: string }[]
    entries: { id: string; kind: EntryKind; name: string; aliases: string[]; summary: string }[]
    namingRules: { id: string; canonical: string; variants: string[] }[]
    threads: ThreadView[]; issues: IssueRow[]; comments: CommentView[]; pendingProposalCount: number
  }
  export type SelectionRange = { start: number; end: number; text: string }
  export type WorkspaceApi = {
    getText(): string
    replaceRange(start: number, end: number, replacement: string): void
    replaceQuote(quote: string, replacement: string, hintStart?: number): boolean
    appendText(text: string): void
    setHighlights(source: string, highlights: Highlight[]): void
    focusRange(start: number, end: number): void
    getSelection(): SelectionRange | null
    saveNow(): Promise<void>
    refresh(): void            // router.refresh()
  }
  export type WritingSidePanelProps = { data: WritingData; api: WorkspaceApi; text: string; position: number }
  ```
- [ ] **Step 1: Test first** `manuscript-editor.test.tsx` (jsdom): typing updates `onBodyChange`; during `compositionstart`…`compositionend` the component calls `onComposingChange(true/false)` and does not re-render highlight marks (render count of the highlight layer stays constant); highlights render `<mark data-kind="issue">` around `[start,end)` text; `readOnly` disables the textarea.
- [ ] **Step 2: Implement `ManuscriptEditor`** props `{ title: string; body: string; onTitleChange(v: string): void; onBodyChange(v: string): void; onComposingChange(c: boolean): void; onSelectionChange(r: SelectionRange | null): void; onCursorChange(pos: number): void; highlights: Highlight[]; readOnly: boolean; targetChars: number; textareaRef: React.RefObject<HTMLTextAreaElement | null> }` — title input + auto-growing textarea (height = scrollHeight, no inner scroll) over a `HighlightLayer` backdrop with identical font, padding, line-height, `white-space: pre-wrap`, `overflow-wrap: anywhere`; textarea text transparent background; serif-free system font, `text-[17px] leading-8`, max width ~720px; highlight updates deferred while composing.
- [ ] **Step 3: `WritingWorkspace`** (client): `useAutosave` with `saveChapterAction`; implements `WorkspaceApi` (replace* operate on current body, then set body; `focusRange` sets selection + scrolls); merges highlight sources; `EditorToolbar` shows save status (`저장됨`/`저장 중…`/`저장 안 됨`/`오프라인: 이 기기에 임시 저장됨`/`충돌`), counts `공백 포함 N자 · 제외 N자 · 목표 대비 N%`, status toggle (초안/완료), `버전 이력` link, chapter switcher (`ChapterPicker`, prev/next); `RecoveryDialog` when `recoverable` (`저장되지 않은 변경이 있습니다. 복구할까요?` 복구/버리기); `ConflictDialog` on conflict (`다른 곳에서 먼저 수정된 원고가 있습니다.` → `서버 원고 불러오기` (router.refresh + replaceAll) / `내 원고로 덮어쓰기` (re-save with the latest version from the error details)); saves resume point on mount and on blur (`saveResumePointAction`); layout: editor left, `WritingSidePanel` right (≥1024px) or in a Sheet toggle below.
- [ ] **Step 4: Page** `chapters/[chapterId]/page.tsx` (server, `maxDuration = 300`): loads `WritingData`; archived chapter → notice + restore button for editors; renders `WritingWorkspace`. Placeholder `side-panel.tsx` exports `WritingSidePanel(props: WritingSidePanelProps)` rendering `패널 준비 중`.
- [ ] **Step 5: History page:** `VersionList` (version, source label 저장/복원/가져오기/AI 초안, time, 글자 수) + selecting a version shows `VersionDiff` (worker `diffTexts` words; inserted green, deleted red strikethrough, stats) against the current text; `이 버전으로 복원` (ConfirmButton → `restoreVersionAction` with current version).
- [ ] **Step 6: Verify:** `pnpm vitest run src/components/writing --maxWorkers=2`; typecheck own paths.

---

### Task T19: Writing screen panels — cards, threads, check + approvals, proofreading, comments, AI draft, reader reactions

**Files:**
- Create: `src/components/writing/side-panel.tsx` (replace placeholder), `src/components/writing/panels/{related-cards,open-threads,check-panel,approval-dialog,proofread-panel,comments-panel,draft-panel,reader-panel}.tsx`, test `src/components/writing/panels/check-panel.test.tsx`

**Interfaces:**
- Consumes: T18 `WritingSidePanelProps`, `WorkspaceApi`, `Highlight`; T13 actions (`runChapterCheckAction`, `runProofreadAction`); T07 actions (`resolveIssueAction`, comments actions); T10 (`ProposalCard`, `listProposalsAction`); T14 actions (`runReaderSimulationAction`, `createChapterFromDraftAction`) and the draft route; T05 actions (`updateFactAction`, `supersedeFactAction`); T06 `addThreadEventAction`; T09 `getTextWorker().findMentions`.
- Produces: `WritingSidePanel(props: WritingSidePanelProps)` with tabs `관련 카드 | 떡밥 | 점검 | 맞춤법 | 코멘트 | AI 초안 | 독자 반응`.
- [ ] **Step 1: Test first** `check-panel.test.tsx` (jsdom, mocked actions): clicking `회차 점검` calls `api.saveNow` then `runChapterCheckAction`; a returned issue renders its `quote` and `wikiExcerpt` side by side; `제안대로 고치기` calls `api.replaceQuote(quote, suggestion)` then `resolveIssueAction({ status: 'accepted' })`; when proposals are returned the approval dialog opens with their count.
- [ ] **Step 2: Implement panels.**
  - `RelatedCards`: debounce 1000 ms; worker `findMentions(text, entries)`; list mentioned cards (name, kind label, mention count, summary, link to entry page); clicking a card highlights its mentions (`setHighlights('search', …)`); footer `위키 전체 {n}개 중 {m}개` .
  - `OpenThreads`: threads with status planted/developing/planned; overdue badge; quick action `이 회차에서 발전`/`이 회차에서 회수` → `addThreadEventAction` with current chapter (errors toasted as returned).
  - `CheckPanel`: button `회차 점검` (disabled for non-editors; spinner text `점검 중… (AI)`), result list: per issue card with kind/severity badges, two columns `원고` (quote, click → `focusRange`) and `위키` (wikiExcerpt + link to the entry), explanation, suggestion; buttons `제안대로 고치기`, `무시`, `위키 고치기` (dialog: `사실 내용 수정` → `updateFactAction`; `이 회차부터 바뀜` → `supersedeFactAction(fromPosition = chapter position)`; then `resolveIssueAction('wiki_updated')`); issue highlights (`kind 'issue'` / `'naming'`); after a run that produced proposals → `ApprovalDialog`.
  - `ApprovalDialog({ open, onOpenChange, workId, chapterId, chapters })`: loads `listProposalsAction({ workId, chapterId, status: 'pending' })`, renders `ProposalCard`s (compact) + `모두 승인 (AI 태그 그대로)` → bulk approve; title `이 회차에서 찾은 위키 후보 {n}건`.
  - `ProofreadPanel`: `규칙 검사` (instant, `useAi false`) and `AI 교정` (`useAi true`); list with `원문 → 수정안`, reason, `적용` (`replaceQuote`), `모두 적용 (규칙)`; highlights kind `spelling`.
  - `CommentsPanel`: list `CommentView`s with replies; `선택한 문장에 코멘트` uses `api.getSelection()` (prompt `먼저 원고에서 문장을 선택하세요.` when none); reply box; resolve/reopen; delete own; highlights kind `comment`; viewers read-only.
  - `DraftPanel`: textarea `무슨 일이 일어나야 하나요?`, target chars (default `targetChars`), character multi-select (entries of kind character), `초안 쓰기` → `fetch('/api/works/{workId}/draft')` streaming into a read-only preview; after completion: `새 회차로 만들기` (`createChapterFromDraftAction` → navigate) and `현재 원고 끝에 붙이기` (`api.appendText`); label `AI 초안은 작가가 고치고 저장해야 원고가 됩니다.`
  - `ReaderPanel`: persona checkboxes (all 4 default), `독자 반응 보기` → `runReaderSimulationAction`; per persona card (평점 ★, 이탈 위험, 총평, moments with reaction labels 헷갈림/지루함/몰입/이탈 위험/감동; click → `focusRange`); highlights kind `reader`; link `지난 결과 보기` → `/works/[workId]/reader-sim`.
- [ ] **Step 3: Verify:** `pnpm vitest run src/components/writing --maxWorkers=2`; typecheck own paths.

---

### Task T20: Settings board — wiki tabs, entry detail, naming, summaries, style cards (F2, F3, F13 cards)

**Files:**
- Create: `src/app/(app)/works/[workId]/wiki/page.tsx`, `src/app/(app)/works/[workId]/wiki/entries/[entryId]/page.tsx`, `src/components/wiki/{wiki-tabs,entry-list,entry-form,entry-detail,fact-list,fact-form,supersede-dialog,naming-rules,chapter-summaries,style-cards,entry-history}.tsx`

**Interfaces:**
- Consumes: T05 services/actions, T06 `listThreads` (for linked threads display), T04 `listChapters` + `setChapterSummaryAction` (T04 `actions/chapters.ts`), T03b `listChanges`, T14 `suggestStyleCardAction`, T02 labels.
- Produces: pages only.
- [ ] **Step 1: `/wiki` page** (`maxDuration = 300`): tabs via `?tab=` (`characters` default, `world`, `threads` → link to `/wiki/threads`, `graph` → link to `/wiki/graph`, `naming`, `summaries`, `styles`). Characters/world tabs: `EntryList` (search box, kind filter chips for world kinds, cards with name, aliases, summary, fact count) + `새 인물`/`새 항목` → `EntryForm` dialog (kind, 이름, 별칭 (comma separated), 한 줄 요약, kind-specific fields from `CHARACTER_FIELD_LABELS`/`PLACE_FIELD_LABELS`, 자유 필드 key/value rows, 설명 (textarea)).
- [ ] **Step 2: Entry detail page:** header (name, kind, aliases, `보관`/`복원`, `수정`), fields table, description, `FactList` (each: `FactStatusBadge`, content, validity `{N}화부터` / `~{M}화`, `SourceLabel`, evidence quote, superseded facts dimmed with `({N}화부터 바뀜)` + link; menu `내용 수정` (`FactForm`), `태그 바꾸기`, `N화부터 바뀜` (`SupersedeDialog`: chapter picker + new content + tag), `보관`), `사실 추가` (`FactForm`: 내용, 태그, 출처 회차 (optional), 근거 문장), relations list (other card link, kind, 회차 범위), 등장 회차 list, linked threads, `EntryHistory` (listChanges filtered by targetId: time, summary, 제안자 AI/작가).
- [ ] **Step 3: Naming tab** `NamingRules`: table (올바른 표기, 잘못된 표기 chips, 메모), add/edit/archive. **Summaries tab** `ChapterSummaries`: per chapter (`chapterLabel`), summary textarea saved via `setChapterSummaryAction`, empty ones show `요약이 없습니다`. **Styles tab** `StyleCards`: list (name, 연결 인물, 말투, 규칙, 예시), create/edit/archive form, per character `AI로 문체 카드 제안` → `suggestStyleCardAction` (toast `문체 카드 제안을 승인 대기에 올렸습니다.`).
- [ ] **Step 4: Verify:** typecheck + eslint own paths.

---

### Task T21: Foreshadowing ledger page and relationship graph (F4, F10)

**Files:**
- Create: `src/app/(app)/works/[workId]/wiki/threads/page.tsx`, `src/app/(app)/works/[workId]/wiki/graph/page.tsx`, `src/components/threads/{thread-board,thread-form,thread-detail-dialog,thread-event-form}.tsx`, `src/components/graph/{relation-graph,graph-controls,relation-form}.tsx`

**Interfaces:**
- Consumes: T06 services/actions, T05 `listEntries`, T04 `listChapters`, T03c components.
- Produces: pages only.
- [ ] **Step 1: Threads page:** `ThreadBoard` with columns 계획됨 / 심음 / 발전 중 / 회수 / 폐기 (cards: title, `심은 회차 {N}화`, `목표 {M}화`, importance, related names, overdue badge `회수 목표 지남`); `새 떡밥` → `ThreadForm` (제목, 설명, 상태 계획됨/심음, 심은 회차, 회수 목표 회차 (number), 중요도, 관련 카드 multi-select); card click → `ThreadDetailDialog` (timeline of events with chapter labels and evidence; `ThreadEventForm` (종류 발전/회수/폐기/메모, 회차, 메모, 근거) showing service errors inline; edit/archive).
- [ ] **Step 2: Graph page:** client `RelationGraph` loads `getGraphData` (server-provided props) and renders cytoscape (dynamic import, `ssr: false`) with layout `cose`; node color by kind (legend with `ENTRY_KIND_LABEL`), edge label = kind, arrow when directed; `GraphControls`: chapter slider `1…latestPosition` (default latest) + `전체 보기` toggle; filter: edges with `start ≤ N ≤ end` (nulls open) and nodes with `firstAppearance ≤ N` or null; kind filter chips; node click → side card (name, kind, link `카드 열기`); `관계 추가` → `RelationForm` (두 카드, 관계 종류 (free text with suggestions 가족/연인/적대/동료/소속/스승/친구), 설명, 방향 있음, 시작 회차, 끝 회차); edge click → edit/archive. Empty state when no entries: `카드를 먼저 만들면 관계 그래프가 그려집니다.`
- [ ] **Step 3: Verify:** typecheck + eslint own paths.

---

### Task T22: Approvals page, change history page, export (F5, F17 queue)

**Files:**
- Create: `src/app/(app)/works/[workId]/approvals/page.tsx`, `src/app/(app)/works/[workId]/history/page.tsx`, `src/components/history/{change-list,change-diff,export-button}.tsx`

**Interfaces:**
- Consumes: T10 (`listProposals`, `ProposalList`, actions), T03b (`listChanges`, `revertChange` via a new action in this task? → use `revertChangeAction` from `src/server/actions/history.ts` created here), T15 export route, T09 `getTextWorker().buildBackupZip`, `backupFileName`, T02 dates.
- Files addendum: Create `src/server/actions/history.ts` (`revertChangeAction({ changeId })`).
- [ ] **Step 1: Approvals page:** filters (출처: 전체/인터뷰/원고 가져오기/회차 점검/문체 제안; 묶음: 카드별(default)/회차별), import batch banner per active `sourceRef` of source `import`: `원고 가져오기 제안 {n}건` + `이 가져오기의 제안 모두 승인` (bulkApprove with sourceRef, suggested tags) with ConfirmButton; `ProposalList`; empty state `승인 대기 중인 제안이 없습니다.`
- [ ] **Step 2: History page:** `ChangeList` (filters 대상 종류 / 제안자 AI·작가; rows: time `formatKoreanDateTime`, summary, `AiBadge` when proposerType ai, actor name; expand → `ChangeDiff` showing changed fields before → after; `되돌리기` (editor, ConfirmButton) → `revertChangeAction`, errors toasted (e.g., the CONFLICT message)); pagination `더 보기` using `beforeId` (keyset on `(created_at, id)`). Header action `ExportButton` (owner only): fetch export JSON → worker `buildBackupZip` → download as `backupFileName(title, seoulToday())`; progress text `백업 파일 만드는 중…`.
- [ ] **Step 3: Verify:** typecheck + eslint own paths.

---

### Task T23: Interview page and import page (F1, F6 UI)

**Files:**
- Create: `src/app/(app)/works/[workId]/interview/page.tsx`, `src/app/(app)/works/[workId]/import/page.tsx`, `src/components/interview/{interview-session,question-card,answer-proposals}.tsx`, `src/components/import/{import-wizard,file-drop,split-preview,import-progress}.tsx`, test `src/components/import/split-preview.test.tsx`

**Interfaces:**
- Consumes: T12 (`getInterviewState`, actions), T10 (`ProposalCard`), T16 (actions, routes), T09 (`getTextWorker().parseFile/splitChapters`), T02.
- [ ] **Step 1: Test first** `split-preview.test.tsx`: renders chapters with titles and char counts; `앞 회차와 합치기` merges bodies; `제외` removes from the upload list; title edit updates the item.
- [ ] **Step 2: Interview page** (`maxDuration = 300`): `InterviewSession` — progress (`지금까지 {n}개 질문`), one `QuestionCard` at a time (topic badge, question, rationale in muted text, textarea, buttons `답하기`, `건너뛰기`), after answering show `AnswerProposals` (ProposalCards for that turn: tag select + 승인/거절) then `다음 질문`; `인터뷰 끝내기` → completes and links to 승인 대기 / 설정 보드. Past Q&A collapsible list.
- [ ] **Step 3: Import page** (`maxDuration = 300`): `ImportWizard` steps: (1) `FileDrop` (accept `.txt,.md,.docx`; HWP message from parser shown inline); worker parse → (2) `SplitPreview` (method label 제목 패턴/구분선/분량/한 덩어리, list: title input, `{N}자`, first line, `앞 회차와 합치기`, `제외`; summary `{n}화를 가져옵니다. 회차마다 AI 호출이 1번씩 일어납니다.`) → (3) upload: `createImportJobAction` then batches of 50 via `appendImportChaptersAction` with progress → `startImportJobAction` → (4) `ImportProgress`: polls `GET /api/import-jobs/[id]` every 2 s; when runner is `client` and status `running`, loops `POST …/advance` sequentially while mounted; shows `{processed}/{total}화 처리`, status labels (진행 중/일시정지/완료/오류/취소), `일시정지`, `재개`, `취소`, error/limit message; when done → links `승인 대기에서 확인하기`, `설정 보드 보기`. Existing jobs for the work listed (resume any paused/running job on page open).
- [ ] **Step 4: Verify:** `pnpm vitest run src/components/import --maxWorkers=2`; typecheck + eslint own paths.

---

### Task T24: Schedule, direction advice, reader-simulation results pages (F15, F12, F11)

**Files:**
- Create: `src/app/(app)/works/[workId]/schedule/page.tsx`, `src/app/(app)/works/[workId]/advice/page.tsx`, `src/app/(app)/works/[workId]/reader-sim/page.tsx`, `src/components/schedule/{schedule-view,month-calendar,schedule-item-form,publish-settings}.tsx`, `src/components/advice/{advice-view,advice-option}.tsx`, `src/components/reader-sim/{reader-sim-list,reader-sim-result}.tsx`, test `src/components/schedule/month-calendar.test.tsx`

**Interfaces:**
- Consumes: T07 (`getScheduleInput`, schedule actions), T09 (`computeSchedule` via worker), T03b `updateWorkAction` (settings), T04 (`setChapterPublishedOnAction`), T14 (`listAdviceRuns`, `listReaderSimRuns`, actions), T02 dates/labels.
- [ ] **Step 1: Test first** `month-calendar.test.tsx`: October 2026 grid starts on Sunday 2026-09-27 cell, marks slot days with chapter labels, hiatus days with `휴재`, deadlines with title; today has an outline.
- [ ] **Step 2: Schedule page:** `ScheduleView` (client): summary cards (`비축분 {n}화`, `다음 연재 {date}`, `비축 소진 예상 {date}` or `비축분 없음`, `다음 마감 {title} D-{n}`), warnings list, `MonthCalendar` (prev/next month, cells with publish slots (`{chapterLabel}` or `빈 연재일` in red), hiatus, deadlines/events, done items struck through), `PublishSettings` (연재 요일 toggles 일~토, 하루 회차 수, 비축 목표 → `updateWorkAction({ settings })`, owner only; others read-only), `ScheduleItemForm` (종류, 제목, 날짜, 끝나는 날 (휴재), 회차, 메모), item list with done/delete; buffer chapters list with `연재함` button (sets `publishedOn = today`).
- [ ] **Step 3: Advice page** (`maxDuration = 300`): `AdviceView`: `다음 전개 조언 받기` button (editor) → `runDirectionAdviceAction`; latest result first: 3 `AdviceOption` cards (title, summary, numbered beats, 사용하는 떡밥 chips, 등장 인물 chips, 위험), recommended one marked `추천` with reason, warnings box; history list of earlier runs (time) expandable. Footer note `조언은 참고용입니다. 결정은 작가가 합니다.`
- [ ] **Step 4: Reader-sim page:** `ReaderSimList` grouped by chapter (latest first): run time, average rating, per-persona `ReaderSimResult` (name, ★ rating, 이탈 위험, 총평, moments with reaction labels and quote), link `회차 열기`. Empty: `집필 화면의 '독자 반응' 탭에서 독자 시뮬레이션을 실행할 수 있습니다.`
- [ ] **Step 5: Verify:** `pnpm vitest run src/components/schedule --maxWorkers=2`; typecheck + eslint own paths.

---

### Task T25: Work settings, team management, invite acceptance (F16)

**Files:**
- Create: `src/app/(app)/works/[workId]/settings/page.tsx`, `src/app/(app)/invite/[token]/page.tsx`, `src/components/settings/{work-settings-form,members-panel,invites-panel,danger-zone}.tsx`, `src/components/invite/accept-invite.tsx`

**Interfaces:**
- Consumes: T03b works actions, T07 members services/actions, T02 labels.
- [ ] **Step 1: Settings page** tabs `작품` / `팀`: `WorkSettingsForm` (제목, 장르, 한 줄 소개, 시놉시스, 장기 미등장 경고 기준 (회차 수), 목표 글자 수) owner-editable, others read-only; `DangerZone` (owner): `작품 보관`/`보관 해제` with ConfirmButton. Team tab: `MembersPanel` (name, email, role select for non-owners (owner only), `내보내기` remove (owner), `작품에서 나가기` for self (non-owner)); `InvitesPanel` (owner): role select (편집자/코멘트 작성자/보기 전용), `초대 링크 만들기` → shows full URL `${origin}/invite/${token}` with copy button and expiry, list of active invites with `취소`. Explanation text: `초대 링크를 받은 사람은 로그인한 뒤 이 작품에 참여합니다. 링크는 한 번만 쓸 수 있고 7일 뒤 만료됩니다.`
- [ ] **Step 2: Invite page** (`/invite/[token]`, inside `(app)` so login is required and returns via `next`): `getInviteByToken`; unusable → `만료되었거나 사용할 수 없는 초대입니다.`; else card `{inviter}님이 '{workTitle}' 작품에 {role}(으)로 초대했습니다.` + `참여하기` → `acceptInviteAction` → `/works/[workId]`.
- [ ] **Step 3: Verify:** typecheck + eslint own paths.

---

### Task T26: Integration, CLAUDE.md check, README, E2E smoke tests

**Files:**
- Create: `e2e/{helpers.ts,auth.spec.ts,core-flow.spec.ts,import.spec.ts,graph-and-export.spec.ts,team.spec.ts}`, `e2e/fixtures/sample-3ch.txt`
- Modify: `README.md`; any file needed to make the full suite pass (this task may edit any file, minimal fixes only, each listed in the report).

- [ ] **Step 1:** Run `pnpm typecheck && pnpm lint && pnpm test`; fix failures with minimal edits. Run `pnpm build`.
- [ ] **Step 2: E2E specs** (Playwright, demo mode via `e2e:server`):
  - `auth.spec.ts`: sign up (unique email) → lands on `/works` showing `내 작품`; log out → `/login`; log in again.
  - `core-flow.spec.ts`: create work `테스트 작품` → 바로 쓰기 → type `서윤은 오른손으로 검을 쥐었다.` → wait for `저장됨`; open 설정 보드 → 새 인물 `서윤` → add fact `서윤은 왼손잡이다.` (확정); back to chapter → 점검 tab → `회차 점검` → an issue card shows `서윤은 오른손으로 검을 쥐었다.` and `서윤은 왼손잡이다.`; approval dialog (if shown) → `모두 승인`; 승인 대기 page shows the empty state; 이력 page lists `인물 '서윤' 생성`.
  - `import.spec.ts`: import page → upload `e2e/fixtures/sample-3ch.txt` (3 chapters with `1화`/`2화`/`3화` headings, ≥ 3 repeated names) → preview shows 3 rows → start → progress reaches `3/3화` → `승인 대기에서 확인하기` → at least one proposal card.
  - `graph-and-export.spec.ts`: create two characters and a relation → graph page renders a `canvas` inside the graph container; history page `백업 내보내기` → download event with filename matching `/^다음화-백업-.*\.zip$/`.
  - `team.spec.ts`: owner creates an editor invite link → second browser context signs up and opens the link → `참여하기` → sees the work title on its home page.
- [ ] **Step 3:** `pnpm e2e` → all pass. Fix and re-run until green.
- [ ] **Step 4: README** (Korean): what the app is, requirements (Node 24, pnpm), setup (`pnpm install`, copy `.env.example` → `.env.local`, `pnpm dev`), demo mode vs real AI (`ANTHROPIC_API_KEY`, model variables), commands, tests, deploy steps (Vercel + Neon: set env vars, `DATABASE_URL`, build command `pnpm db:migrate && pnpm build`; Inngest optional: set keys and sync `/api/inngest`), project structure, limits (HWP unsupported, no realtime co-editing).
- [ ] **Step 5: Report** the final state of all commands.

---

### Task T27: Continuity accuracy eval harness (spec §12)

**Files:**
- Create: `eval/fixtures/continuity/{work.json,answers.json}`, `eval/fixtures/continuity/chapters/{01..10}.md`, `eval/run-continuity.ts`, `eval/score.ts`, `eval/score.test.ts`

**Interfaces:**
- Consumes: T01 `createTestDb` + factories, T08 (`buildContextPack`, `runAiTask`, `AnthropicAiClient`, `FakeAiClient`), T13 `continuityCheckTask`.
- Produces: `scoreIssues(expected: ExpectedIssue[], found: FoundIssue[]): { hits: number; misses: ExpectedIssue[]; falsePositives: FoundIssue[]; precision: number; recall: number }` with `ExpectedIssue = { chapter: number; quoteIncludes: string; kind: IssueKind }`, `FoundIssue = { chapter: number; quote: string; kind: IssueKind }` (hit = same chapter and found quote contains `quoteIncludes` or vice versa; each found issue matches at most one expected).
- [ ] **Step 1: Fixture.** An original (made-up) Korean fantasy web novel, 10 chapters × 900–1300 chars; `work.json` holds entries (≥ 6: characters, places, rules with aliases), facts (≥ 20, with statuses; at least 2 with validity ranges), threads (≥ 3 with planted/target positions), naming rules (≥ 2). Plant exactly 12 errors across chapters 3–10 (contradictions of facts, naming variants, a payoff of an unplanted thread, a time-line slip, an age change that IS explained by a validity range — that one must NOT be expected) and list the 11 true errors in `answers.json` with `quoteIncludes` fragments copied from the chapter text.
- [ ] **Step 2: Test first** `score.test.ts`: overlapping quote counts as hit; same quote in a different chapter is a false positive; precision/recall math.
- [ ] **Step 3: Runner** `eval/run-continuity.ts`: loads the fixture into `createTestDb()`, then for chapters 1–10 runs `buildContextPack` + `continuityCheckTask` through `runAiTask` (client: `AnthropicAiClient` unless `--fake`); without `ANTHROPIC_API_KEY` and without `--fake` prints `ANTHROPIC_API_KEY가 없어 평가를 건너뜁니다. --fake로 실행 흐름만 확인할 수 있습니다.` and exits 0; prints a per-chapter table and totals (hits, misses, false positives, precision, recall); writes `eval/results/continuity-<timestamp>.json`.
- [ ] **Step 4: Verify:** `pnpm vitest run eval --maxWorkers=2` and `pnpm eval:continuity --fake` complete.

---

## Self-Review Notes (orchestrator)

- Spec coverage: F1 T12/T23 · F2 T05/T20 · F3 T05/T20/T03c · F4 T06/T21 · F5 T03b/T04/T15/T18/T22 · F6 T09/T13/T16/T23 · F7 T13/T19 · F8 T11/T17 · F9 T08/T19 · F10 T06/T21 · F11 T14/T19/T24 · F12 T14/T24 · F13 T05/T14/T19/T20 · F14 T02/T13/T19 · F15 T07/T09/T24 · F16 T07/T19/T25 · F17 T04/T11/T17/T22 · auth T01/T03a · demo mode T02/T08/T03c · eval T27.
- Type names cross-checked: `ChangeOpts` (T05, re-declared identically in T06), `NewIssue` (T07→T13), `Extraction`/`extractionToProposals` (T12→T13/T16), `ProposalView` (T10→T19/T22/T23), `WritingSidePanelProps` (T18→T19), `ThreadView` (T06→T18), `CommentView` (T07→T18), `ScheduleInput` (T01→T07/T09), `ExportPayload` (T01→T09/T15).
