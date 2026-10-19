# Handoff: AI improvement round (brainstorming in progress)

Written 2026-10-19. Read this first when continuing in a new session.

## 1. What the user wants

Source backlog: `docs/eval/novel/follow-up-ai-improvement.md` (sections 2 and 3). The user asked to judge the follow-up work, then carry it out. Decisions so far (all from the user):

- **Scope:** everything in section 2 (A to J) plus the section 3 harness fixes. Cloud tracks first; local-model tracks (C, D, F) are built too, but on a second branch and only unit-tested with fakes. They are measured later when local models run.
- **Skipped for now:** the remaining local eval runs (gpt-oss, exaone), the re-evaluation of Haiku and Luna ("after that, later"), 2+ chapter evaluation, backlog section 4 (API-key integration, per-role models).
- **Branches:** `feat/ai-improvement-cloud` from `main`; `feat/ai-improvement-local` from the tip of the cloud branch (local tracks edit the same files as cloud tracks, so they come after the cloud merge).
- **Model placement (user decision):** implementation = haiku, per-track review = haiku, integration = sonnet, then a full review by opus. Survey and brief phases used haiku and sonnet; judges and the critic use opus.
- **Workflow size:** as large and parallel as possible ("ultracode" spirit). Split into fine tracks by file ownership.
- **Concurrency:** default cap is 16 per workflow. `~/.claude/settings.json` now has `env` `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS=22` and `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=22` (takes effect after a Claude Code restart; look for `concurrent agent gate = 22` in the next workflow log). The binary was NOT modified (not needed).

## 2. Process state (superpowers:brainstorming, architectural path)

Classified as architectural. Gates:

1. Design presented in chat twice; the user adjusted model placement and scale but has not said "approved". Treat the design as **not yet approved**.
2. Next: finish the survey, write the spec `docs/superpowers/specs/2026-10-19-ai-improvement-design.md`, commit it, ask the user to review it.
3. Then `superpowers:writing-plans`, then the user picks the execution method. No product code before that.

## 3. Tracks (20)

| id | branch | topic (backlog item) |
|---|---|---|
| GUARDS | cloud | shared `src/ai/guards/` library (foundation; others import it) |
| A | cloud | chapter length guarantee (T3) |
| E1 | cloud | sentences-per-paragraph check |
| E2 | cloud | sample-copy and repeated-word check |
| B | cloud | character speech style (Q5); leaning: style-card proposal using the existing 말투 field instead of a new `voice` kind, confirm no DB migration |
| I | cloud | interview question strategy |
| G1 | cloud | extraction dedupe and quote verification |
| G2 | cloud | name truncation, relation endpoints, thread state |
| H | cloud | continuity check context and rules |
| J | cloud | proofread scope and quote merging |
| HX1 | cloud | harness: blind reviewer (mask `model` in calls/*.json) |
| HX2 | cloud | harness: add `새 회차` to the English substitution table |
| HX3 | cloud | harness: author agent sees the wiki and its earlier decisions |
| HX4 | cloud | harness: summary save, RESUME.md error case, copy retry, resummarize --date |
| C | local | foreign-script block |
| D | local | two-step draft (beats then prose) |
| F1 | local | proofread split in three |
| F2 | local | chapter extract split |
| F3 | local | reader simulation per persona |
| F4 | local | local server serialization, effort switch |

Planned flow: survey (done) -> briefs -> verify -> cross-track plan -> spec -> plan -> implement (haiku, worktrees, TDD) -> per-track review (haiku) -> integrate (sonnet) -> full review (opus).

## 4. Survey workflow state

- Run id `wf_f22cee2a-947`; script:
  `/home/xogud/.claude/projects/-home-xogud-documents-github-DaeumHwa/c572e054-19f3-4d91-b475-4e814ff34b5c/workflows/scripts/daeumhwa-ai-improvement-survey-wf_f22cee2a-947.js`
- Stages: 5 haiku surveyors per track (code, tests, evidence, risks, specs) -> sonnet brief (writes `<scratchpad>/briefs/<id>.md`) -> 2 haiku verifiers -> sonnet revise -> conflict matrix, 3 wave plans plus opus judge, guards API designs plus opus judge -> opus critic.
- When this note was written: 95 survey results done, 12 brief agents started, none finished; 5 surveyors had not returned (F2:tests, F4:evidence, F4:risks, F4:specs, HX2:specs). The brief directory in the scratchpad was still empty.
- Resume: `Workflow({scriptPath: <above>, resumeFromRunId: "wf_f22cee2a-947"})`. Cached results work only inside the same session; if the cache is gone it reruns from scratch (same result, more cost). The script's `BRIEF_DIR` points into the old session's scratchpad; if a new session is used, edit that constant first or point it at `docs/superpowers/handoff/2026-10-19-ai-improvement/briefs`.
- Raw survey output was saved to `survey/<TRACK>.md` next to this file (unverified; re-check paths and line numbers before using them).

## 5. Repo notes

- `git status` shows untracked clutter (`.bash_profile`, `.bashrc`, `.claude/*`); it is not part of this work. Never `git add -A`; add files by name.
- Rules to keep in mind (from CLAUDE.md): Korean user-facing copy, `AppError`/`ActionResult`, `change_log` in the same transaction, AI never writes wiki tables directly, no package changes, Next.js 16 docs under `node_modules/next/dist/docs/`.

## 6. Prompt to continue

See the section "Continuation prompt" in the chat reply that accompanied this file; the same text is in `CONTINUE.md` next to this file.
