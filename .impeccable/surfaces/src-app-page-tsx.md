---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/globals.css","src/app/(app)/layout.tsx","src/app/(auth)/layout.tsx"]
---

# Surface brief: public intro page and app world

## Scope and mode

- `/` for signed-out visitors: the public intro page (Persuade). Signed-in visitors still go to `/works`.
- The same world carries into the app shell, auth pages and working screens (Operate): there it shows as precision and restraint, not costume.

## Audience, job, action

- Judges of the 4차산업혁명 and 예술창업 panel, opening the live site once; serial web-novel authors deciding whether to try it.
- Action: sign up (or log in) and run the one-click sample work check.
- Proof: the sample work's real planted errors (3화 열한 층 vs 9층, 3화 왼손 vs 오른손, 2화 19살 vs 16살) shown with the wiki original text. No invented numbers, users, quotes or pricing.
- Constraints: Korean-only UI copy (e2e guard), no English words of 2+ letters; no package changes; light scene only.

## Direction contract

THESIS: The page is the editor's returned proof. The manuscript sits on the sheet, the wrong words carry a drawn proof mark, and the margin carries the wiki original in blue pencil. It refuses the category default: a SaaS hero beside an app screenshot in a browser frame, then a row of feature cards.

OWN-WORLD: Cool proof paper (desk #eef0ed, sheet #fafbf9), graphite text #2b2d2c, one 1px margin rule #c9cdc8. Proof red #c8321f only for marks on the manuscript and for errors. Blue pencil #2f5d9e only for the canon (wiki original), its links and focus. Noto Serif KR (Myeongjo) for display, manuscript and canon quotes; system Hangul sans for UI. Hahmlet was tried first and replaced: rendered, its Hangul reads as a sans and loses the typeset-proof voice. Marks are drawn strokes (circle, underline, caret, leader), never tinted left borders or pill badges. Corners 2–4px; no shadows except a soft offset sheet lift.

STORY: The visitor reads one real line of 3화, sees the mark and the canon note beside it, understands the check at a glance, believes it because both texts are quoted, and starts with the sample work.

FIRST VIEWPORT: One full-width proof sheet. Slug line: wordmark left, 로그인 over the margin column. Text block (left ~62%): Myeongjo 700 headline ~68px on two lines, a 20px lede, the primary 시작하기 button and a 로그인 link, then the 3화 excerpt in Myeongjo 24px with 2.0 leading and "열한 층" circled in proof red. Margin column (right ~30%, after the rule): the correction 아홉 층 in red and the wiki original in blue Myeongjo, aligned to the marked line, joined by a red leader.

FORM: 교정지 (the editor's galley proof), position 1 of my round-1 grounded list, shown as IMPECCABLE'S PICK in round 1 and readopted by the user after the round-2 re-roll. seed: 5e86947a01bcdb06. Signature interaction: the proof mark draws itself once (circle, then leader to the margin) on the intro page. In the app the finding mark is a red underline drawn once when the finding lands; the user chose this on 2026-11-23 in their words, "밑줄로 확정", over an in-app circle. Motion grammar: one pencil-stroke draw, ease-out, under 900ms; reduced motion shows the final state.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Dark mode is out of scope (no theme switch exists today).
- Inline sign-up on the intro page was not built; the primary action opens /signup.
