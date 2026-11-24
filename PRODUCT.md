# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** long-running serial web-novel authors (tens to hundreds of chapters on Munpia, KakaoPage, Naver Series and similar). As the chapters pile up they lose track of their own settings: ages, places, who holds the knife in which hand, which foreshadowing is still open. They write chapter by chapter, usually at a desk, in Korean.
- **Secondary:** the author's editor, invited to the work by link. The editor reads, comments and reviews; the author stays the owner.
- **Evaluators:** judges of the 2026 AI 라이프 솔루션 챌린지 finals (4차산업혁명 and 예술창업 panel). They open the live site once, usually through the one-click sample work, and judge it as a service someone could launch.

## Product Purpose

다음화 is a settings wiki plus an AI serial partner. It keeps characters, places, world rules and foreshadowing in one place and checks each chapter against them before it is published. Success means a contradiction is caught and shown with its evidence before readers see it, and the author never loses control of the canon.

## Positioning

Lead with the **evidence-backed chapter check**: each finding puts the manuscript sentence next to the wiki's original text, with a suggested fix, and the author decides whether to fix the manuscript or the wiki.

Claims that hold against competitors (StoryBench hands-on, 2026-11-04):

- check results that quote the manuscript beside the wiki original;
- approval and history across every wiki type (characters, settings, threads, relations);
- 확정 / 가정 / 미정 statuses and the chapter range a fact holds for;
- published accuracy measurements (`docs/eval/harness/`).

Do not call the sample work or the approval step unique; StoryBench has both.

## Operating Context

- Live at https://daeumhwa.vercel.app (Vercel, functions in sin1, Neon Postgres in Singapore).
- First contact for judges and new users: `내 작품` → `샘플 작품으로 체험하기` creates the sample work 잿빛 종루 (3 chapters, 3 planted errors) and runs the chapter 3 check, which takes about 15–25 s with real AI.
- Daily loop for an author: write a chapter in the editor (autosave, offline drafts) → mark it `완료` → the check runs → findings in the 점검 tab and wiki candidates in `승인 대기` → approve or reject.
- Other surfaces: 설정 보드 (characters, world, threads ledger, relation graph, name rules, chapter summaries, style cards, author requests), history, schedule, direction advice, reader simulation, import (.txt/.md/.docx), interview, work settings and invites.

## Capabilities and Constraints

- All user-facing copy is Korean, short and plain. An e2e guard (`e2e/korean-copy.spec.ts`) fails on any English word of two or more letters in the UI (allowlist: ai, txt, md, docx, zip, hwp).
- AI never writes the wiki directly. Wiki changes come from the author or approved proposals; every change is logged; rows are archived, never deleted.
- Non-members always get "not found".
- Korean IME input must never break in the editor. Unsaved manuscript must never be lost.
- Dates and day boundaries use Asia/Seoul.
- Stack: Next.js 16 App Router, React 19, Tailwind CSS v4, shadcn/ui on Base UI (composition via `render`, not `asChild`), lucide-react icons, sonner toasts.
- Packages are not added, removed or upgraded without the orchestrator.
- Fonts today: Black Han Sans for headings, IBM Plex Sans KR for body text and manuscripts, and Nanum Pen Script for handwritten notes. The root layout loads them through `next/font/google` and `src/app/fonts.test.ts` checks the setup.
- Not supported: HWP import, real-time co-editing, social login, payments.
- Undecided: whether a public intro page exists before login (today `/` redirects to `/login` or `/works`).

## Brand Commitments

- Name: 다음화. No logo, color, typeface or imagery is fixed; the visual identity is open.
- Voice: short, plain Korean sentences. Name things by what the author does, not by how the system works.
- Wording rule for pitch and docs: never say "저장하면 쌓인다". Say that running the check (or marking a chapter 완료) raises candidates automatically, and they enter the wiki only when approved.

## Evidence on Hand

- Sample work 잿빛 종루 with 3 planted errors (2화 age 19 vs 16, 3화 열한 층 vs 9층, 3화 left vs right hand); all 3 were found on prod with wiki-original evidence (2026-11-03).
- Accuracy and harness measurements in `docs/eval/harness/` and `docs/eval/`.
- Prod screenshots in `~/Desktop/daeumhwa-shots/`.
- Absent, must not be fabricated: testimonials, user counts, customer names, pricing, partner logos, press.

## Product Principles

1. The author has the last word. AI proposes; nothing reaches the canon without approval.
2. Evidence before verdict. A finding without the manuscript sentence and the wiki original is not shown as a finding.
3. Writing comes first. Checks and panels support the manuscript and never crowd it out.
4. Nothing the author wrote is ever lost.
5. Korean first and honest: every claim on screen is true of the product today.

## Accessibility & Inclusion

- Korean IME composition must work everywhere text is entered.
- Keyboard focus visible; the editor and the check panel usable with the keyboard.
