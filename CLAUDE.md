@AGENTS.md

# 다음화 (DaeumHwa)

장기 연재 웹소설 작가를 위한 설정 위키 + AI 연재 파트너. Next.js 16 (App Router) + PostgreSQL.

- Spec (Korean): `docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md`
- Plan: `docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md` (tasks T00–T27, interfaces, tests)

## Commands

- `pnpm dev` / `pnpm start` — run `db:migrate` first (local DB = PGlite in `.data/pglite` unless `DATABASE_URL` is set)
- `pnpm test [paths]` — Vitest. When other agents run in parallel: `pnpm vitest run <paths> --maxWorkers=2`
- `pnpm typecheck` (= `next typegen && tsc --noEmit`). Parallel agents use `pnpm exec tsc --noEmit` (no typegen) and filter output to their own files.
- `pnpm lint` (`eslint .`), `pnpm eslint <paths>`, `pnpm format`, `pnpm build`, `pnpm e2e`
- `pnpm db:generate` after editing `src/db/schema.ts`; `pnpm db:migrate`

## Architecture

- `src/db` — Drizzle schema (`schema.ts`), `getDb()` (`client.ts`), unions and row types (`types.ts`)
- `src/server/*` — domain services `fn(db, actor, input)`; first line checks `requireWorkRole`
- `src/server/actions/*` — `'use server'` wrappers: zod-parse input → `withAction` → `revalidateWork` → `ActionResult`
- `src/ai` — `AiClient` (Anthropic SDK or OpenCode Go), `tasks/*` (prompt + zod schema), `run.ts` (usage limit, `ai_runs`), `context.ts` (context pack)
- `src/lib` — pure utilities (korean text, import parsing, diff, backup, search, schedule, labels, dates, errors, result)
- `src/workers` + `src/lib/client` — Comlink Web Worker, IndexedDB drafts, autosave hook
- `src/components/ui` — shadcn (Base UI flavor); `src/components/app` — shared app components; other folders per feature

## Rules

- All user-facing copy is Korean, short and plain. Identifiers and comments are English.
- AI never writes wiki tables directly. Wiki changes come from author actions or approved proposals, and every wiki change records `change_log` in the same transaction. Wiki rows are archived, never deleted.
- Services throw `AppError(code, koreanMessage)`; actions never throw, they return `ActionResult`.
- Non-members always get `NOT_FOUND`, never a hint that the work exists.
- Day boundaries and displayed dates use Asia/Seoul (`src/lib/dates.ts`).
- Do not add, remove or upgrade packages without the orchestrator.

## Next.js 16 notes

- Read `node_modules/next/dist/docs/` before using an API you are unsure about.
- `params` and `searchParams` are Promises. Type them inline (`{ params: Promise<{ workId: string }> }`); do not use the generated `PageProps`/`LayoutProps` helpers in new files.
- `cacheComponents` is OFF (previous caching model). Pages that read the session are dynamic automatically.
- Route handlers or server components that touch the DB without reading headers/cookies must call `await connection()` from `next/server` first, so the build does not prerender them.
- Pages or route handlers that trigger AI: `export const maxDuration = 300`.

## UI notes (shadcn on Base UI, not Radix)

- Read the component file in `src/components/ui/` before using it.
- Composition uses the `render` prop, not `asChild`: `<DialogTrigger render={<Button variant="outline" />}>열기</DialogTrigger>`.
- For links that look like buttons use `<Link className={buttonVariants({ variant: 'outline' })} href=…>`.
- `cn` comes from `@/lib/utils`. Icons from `lucide-react`. Toasts via `sonner` (`toast.success`, `toast.error`); call actions through `runAction` from `@/lib/client/run-action`.

## Tests

- Colocated `*.test.ts(x)`. Service tests: `const db = await createTestDb()` in `beforeEach`; data via `@/test/factories`.
- Component tests start with `// @vitest-environment jsdom`.
- AI in tests: `FakeAiClient` lives in `@/test/fake-ai` and its fixed outputs in `@/test/ai-fakes`; pass one in or call `setAiClientForTests`. Never call the real API in tests.
- E2E AI answers come from the stub in `e2e/ai-stub` (`pnpm e2e:ai-stub`), not from `@/test/*`.
