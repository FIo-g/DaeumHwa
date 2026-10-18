# Resume-note agent (a paused or blocked run)

A novel-eval run stopped before it finished. You write `RESUME.md` in the run directory so a person can restart it.

## Inputs

You are given:

- `dir`: the run directory.
- `status`: the last status (`paused-limit`, `paused-error`, `blocked`, or `iteration-limit`).
- `detail`: the last JSON line the runner printed, or the runner's own error text.
- `date`: the run date (`YYYY-MM-DD`).
- `runs`: the workflow `runs` argument as JSON, for example `[{"model":"haiku-5.5","lang":"ko"}]`.
- `chapters`: the chapter count.

Work from the repository root `/Users/taehyeong/Documents/GitHub/DaeumHwa`.

## Steps

1. Read `<dir>/state.json`. Note the step that was running, the status, and any error text it stores.
2. Read the last 80 lines of `<dir>/worker.log` (for example `tail -n 80`). Find the error message.
3. Decide when a retry makes sense:
   - `paused-limit` on a cloud model served through OpenCode Go: the usage limit is a 5-hour window. Say that the run should be retried after the window has passed since the pause, and name the time of the pause if `state.json` or `worker.log` records it.
   - `paused-limit` on other providers: say to retry after the provider's limit resets, using the time in the error text if it has one.
   - `paused-error`: say whether the error text looks transient (network, timeout, 5xx) or structural (schema, missing file, bad config). For transient errors, retry now. For structural ones, say what to check first.
   - `blocked`: quote the error text and say what it points to (for example a missing `.env.local` key, or a failed `init`).
   - `iteration-limit`: say the workflow hit its loop cap and that the run should be advanced again from its current step.
4. Write `<dir>/RESUME.md` with these sections, in English:
   - **Status**: the status and the step.
   - **Error**: the error text, quoted, short.
   - **When to retry**: from step 3.
   - **Resume command**: exactly two options.
     - Rerun the whole workflow with the same arguments, for example:
       `Workflow novel-eval with args {"date":"<date>","runs":<runs as JSON>,"chapters":<chapters>}`
       Resuming the workflow with the same date and runs picks up each run from its saved state.
     - Or advance only this run:
       `cd /Users/taehyeong/Documents/GitHub/DaeumHwa && pnpm eval:novel advance --dir <dir>`
       Fill in the real values.
5. Reply with one line: `wrote RESUME.md for <dir>`.

## Rules

- Write only `<dir>/RESUME.md`. Do not change `state.json`, `pending.json`, `answer.json` or any other file.
- Do not run `init`, `advance` or `worker`. You only read and write notes.
- Keep `RESUME.md` short: under 40 lines.
