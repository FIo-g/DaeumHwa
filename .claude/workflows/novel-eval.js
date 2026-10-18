export const meta = {
  name: 'novel-eval',
  description:
    'Run the novel quality eval per model and language: advance each run, let author agents answer pending items, then write reviews and (optionally) a summary',
  whenToUse:
    'DaeumHwa lightweight-model novel eval (eval/novel). Requires args.date (YYYY-MM-DD). Invoke once per model (each invocation is capped at 1000 agents). Resume by rerunning with the same date and runs. A run whose review.md already exists is not reviewed again unless args.rereview is true. Pass summary: true on a final invocation with runs: [] to write the cross-run summary.',
  phases: [
    { title: 'Run', detail: 'init and advance each run; author agents answer pending items' },
    { title: 'Review', detail: 'Sonnet reviewer per finished run, then a copy into docs' },
    { title: 'Summary', detail: 'cross-run summary, only when args.summary is true' },
  ],
}

const REPO = '/Users/taehyeong/Documents/GitHub/DaeumHwa'
const ALL_MODELS = ['qwen3.8-27b', 'gpt-oss-20b', 'exaone3.5-32b', 'haiku-5.5', 'luna-6']
// Canonical order for opaque run dir numbers. Never reorder: NN must stay stable across invocations.
const CANONICAL_MODELS = [
  'qwen3.8-27b',
  'gpt-oss-20b',
  'exaone3.5-32b',
  'haiku-5.5',
  'luna-6',
  'fake',
]
const LANGS = ['ko', 'en']
const MODEL_QUEUES = {
  'qwen3.8-27b': 'local',
  'gpt-oss-20b': 'local',
  'exaone3.5-32b': 'local',
  'haiku-5.5': 'cloud',
  'luna-6': 'cloud',
  fake: 'local',
}
const QUEUE_NAMES = ['local', 'cloud']
const MAX_LOOP_ITERATIONS = 400
// The same pending item coming back this many times in a row means the author's answers do not
// clear it. The run stops with status error rather than spending agents on it. The interview is
// one plan step with up to 12 interview_answer pendings, so a healthy run can repeat the step for
// many turns without a proposal. 30 is above the 12 questions and still bounds a stuck author
// to about 60 agents.
const MAX_SAME_PENDING = 30

const RUNNER_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['status', 'detail'],
}

if (!args || typeof args.date !== 'string' || !/^\d{4}-\d{2}-\d{2}(-[a-z0-9]+)?$/.test(args.date)) {
  throw new Error('args.date (YYYY-MM-DD or YYYY-MM-DD-suffix) is required')
}
const date = args.date
const chapters = args.chapters || 5
const withSummary = args.summary === true
const rereview = args.rereview === true
const runs = Array.isArray(args.runs)
  ? args.runs
  : ALL_MODELS.flatMap((model) => LANGS.map((lang) => ({ model, lang })))

if (runs.length > 4) {
  log(
    `warning: ${runs.length} runs in this invocation; invoke once per model; each invocation is capped at 1000 agents`,
  )
}
if (runs.length === 0 && !withSummary) {
  return { runs: [] }
}

// Opaque run dir: the model id must not appear in any path an author or reviewer sees.
const runDir = (run) => {
  const n = CANONICAL_MODELS.indexOf(run.model) + 1
  return `eval/results/novel/${date}/run-${String(n).padStart(2, '0')}-${run.lang}`
}
const docsReviewPath = (run) => `docs/eval/novel/${date}/${run.model}-${run.lang}.md`

function errorText(err) {
  return err && err.message ? err.message : String(err)
}

// Every agent call goes through here. A throw or an empty result is logged with the run label and
// returns null, so no failure is dropped silently. options.label names the agent in the log.
async function agentLogged(prompt, options) {
  try {
    const result = await agent(prompt, options)
    if (result === null || result === undefined) {
      log(`${options.label}: agent returned no result`)
      return null
    }
    return result
  } catch (err) {
    log(`${options.label}: agent failed: ${errorText(err)}`)
    return null
  }
}

// The status a runner reported, trimmed and lowercased. A missing result is an error.
function runnerStatus(step) {
  if (!step || typeof step.status !== 'string') return 'error'
  return step.status.trim().toLowerCase()
}

// The step and pending kind from the advance JSON line. Equal keys mean the same item is waiting.
function pendingKeyOf(detail) {
  try {
    const parsed = JSON.parse(detail)
    return `${parsed.step}|${parsed.pendingKind}`
  } catch (err) {
    return detail
  }
}

function runnerPrompt(run, dir, first) {
  const initStep = first
    ? [
        'Step 1. Run this command once, from the repository root:',
        `  cd ${REPO} && pnpm eval:novel init --model ${run.model} --lang ${run.lang} --chapters ${chapters} --dir ${dir}`,
        'If the command fails, or its JSON line has an "error" field, return status "error" with the error text as detail, and stop.',
        'Otherwise go to step 2.',
      ].join('\n')
    : 'Do NOT run init. Go straight to step 2.'
  return [
    'You are a runner. Use only the Bash tool. Do not edit any file. Do not read any file.',
    '',
    initStep,
    '',
    'Step 2. Run this command with the Bash timeout set to 600000 ms:',
    `  cd ${REPO} && pnpm eval:novel advance --dir ${dir}`,
    'The command prints one JSON line on stdout, with a "status" field. Read that last JSON line.',
    'If the line has an "error" field and no "status" field, or the command exits non-zero, the command failed: return status "error" with the error text as detail, and stop.',
    'If status is "running", run the same advance command again.',
    'Run advance at most 20 times in this invocation. Stop as soon as status is not "running".',
    '',
    'Return:',
    '- status: the "status" value from the last JSON line (or "running" if you hit the 20-call limit, or "error" if a command failed).',
    '- detail: the last JSON line verbatim (or the error text if a command failed).',
  ].join('\n')
}

// Checks whether the run already has a review. The reviewer and the docs copy are skipped when it does.
function reviewExistsPrompt(dir) {
  return [
    'You are a runner. Use only the Bash tool. Do not edit any file. Do not open any file yourself.',
    '',
    'Run this command from the repository root:',
    `  cd ${REPO} && if test -f ${dir}/review.md; then echo exists; else echo missing; fi`,
    'Return status "exists" or "missing", as the command printed it. If the command fails, return status "error" and the error text as detail.',
  ].join('\n')
}

function authorPrompt(dir, lang) {
  return [
    `Follow the instructions in ${REPO}/eval/novel/agents/author.md.`,
    `Inputs: dir = ${REPO}/${dir}, lang = ${lang}.`,
    'Answer the pending item in dir and write answer.json as the instructions say.',
  ].join('\n')
}

function reviewerPrompt(dir, lang) {
  return [
    `Follow the instructions in ${REPO}/eval/novel/agents/reviewer.md.`,
    `Inputs: dir = ${REPO}/${dir}, lang = ${lang}.`,
    'Write the review document to <dir>/review.md as the instructions say.',
  ].join('\n')
}

function copyPrompt(run, dir) {
  return [
    'You are a runner. Use only the Bash tool. Do not edit any file. Do not open any file yourself; run only the commands below.',
    '',
    'Run this command from the repository root:',
    `  cd ${REPO} && mkdir -p docs/eval/novel/${date} && cp ${dir}/review.md ${docsReviewPath(run)}`,
    'If the command succeeds, return status "copied" and detail = the destination path.',
    'If it fails, return status "failed" and the error text as detail.',
  ].join('\n')
}

function resumePrompt(run, dir, status, detail) {
  return [
    `Follow the instructions in ${REPO}/eval/novel/agents/resume-note.md.`,
    `Inputs: dir = ${REPO}/${dir}, status = ${status}, detail = ${detail}, date = ${date}, runs = ${JSON.stringify(runs)}, chapters = ${chapters}.`,
    'Write RESUME.md in dir as the instructions say.',
  ].join('\n')
}

function summaryPrompt(results) {
  const list = results.map((r) => {
    const dir = runDir(r)
    const item = { model: r.model, lang: r.lang, status: r.status, dir: `${REPO}/${dir}` }
    if (r.status === 'done') item.reviewPath = `${REPO}/${docsReviewPath(r)}`
    else item.resumePath = `${REPO}/${dir}/RESUME.md`
    return item
  })
  return [
    `Follow the instructions in ${REPO}/eval/novel/agents/summary.md.`,
    `Inputs: date = ${date}, runs = ${JSON.stringify(list)}.`,
    'Also read every review document in docs/eval/novel/<date>/ named <model>-<lang>.md, including runs from earlier invocations that are not listed in runs.',
    `Write ${REPO}/docs/eval/novel/${date}/summary.md as the instructions say.`,
  ].join('\n')
}

const reviews = []
const results = []

// Reviews a finished run and copies the review into docs. A run that already has review.md keeps
// it (its notes are never overwritten) unless args.rereview is true. Returns null on failure.
async function reviewRun(run, dir, label) {
  if (!rereview) {
    const found = await agentLogged(reviewExistsPrompt(dir), {
      label: `check review ${label}`,
      phase: 'Review',
      model: 'haiku',
      schema: RUNNER_SCHEMA,
    })
    const foundStatus = runnerStatus(found)
    if (foundStatus === 'exists') {
      log(`${label}: review.md exists, review and copy skipped (args.rereview is not true)`)
      return 'skipped'
    }
    if (foundStatus !== 'missing') {
      log(`${label}: could not check review.md, review skipped`)
      return null
    }
  }
  const reviewed = await agentLogged(reviewerPrompt(dir, run.lang), {
    label: `review ${label}`,
    phase: 'Review',
    model: 'sonnet',
  })
  if (reviewed === null) {
    log(`${label}: review returned no result, copy skipped`)
    return null
  }
  const copied = await agentLogged(copyPrompt(run, dir), {
    label: `copy review ${label}`,
    phase: 'Review',
    model: 'haiku',
    schema: RUNNER_SCHEMA,
  })
  if (runnerStatus(copied) !== 'copied') {
    log(`${label}: review copy did not succeed: ${copied ? copied.detail : 'no result'}`)
    return null
  }
  return copied.detail
}

// Returns the run's final status. Throws only for errors the caller must record.
async function executeRun(run) {
  const dir = runDir(run)
  const label = `${run.model}-${run.lang}`
  let first = true
  let status = 'running'
  let iterations = 0
  let lastPending = null
  let samePending = 0

  while (true) {
    if (iterations >= MAX_LOOP_ITERATIONS) {
      log(`${label}: loop limit of ${MAX_LOOP_ITERATIONS} iterations hit`)
      status = 'iteration-limit'
      await agentLogged(resumePrompt(run, dir, status, 'workflow loop limit reached'), {
        label: `resume ${label}`,
        phase: 'Run',
        model: 'sonnet',
      })
      break
    }
    iterations++

    const step = await agentLogged(runnerPrompt(run, dir, first), {
      label: `run ${label}`,
      phase: 'Run',
      model: 'haiku',
      schema: RUNNER_SCHEMA,
    })
    first = false
    status = runnerStatus(step)
    const detail =
      step && typeof step.detail === 'string' ? step.detail : 'runner agent returned no result'

    if (status === 'running') continue

    if (status === 'pending') {
      const key = pendingKeyOf(detail)
      samePending = key === lastPending ? samePending + 1 : 1
      lastPending = key
      if (samePending >= MAX_SAME_PENDING) {
        const message = `the same pending item came back ${samePending} times in a row after author answers (${key})`
        log(`${label}: stopped: ${message}`)
        status = 'error'
        await agentLogged(resumePrompt(run, dir, status, message), {
          label: `resume ${label}`,
          phase: 'Run',
          model: 'sonnet',
        })
        break
      }
      await agentLogged(authorPrompt(dir, run.lang), {
        label: `author ${label}`,
        phase: 'Run',
        model: 'sonnet',
      })
      continue
    }

    if (status === 'done') {
      reviews.push(
        reviewRun(run, dir, label).catch((err) => {
          log(`${label}: review error: ${errorText(err)}`)
          return null
        }),
      )
      break
    }

    if (status === 'error') log(`${label}: error: ${detail}`)
    // paused-limit, paused-error, blocked, error, or anything unexpected
    await agentLogged(resumePrompt(run, dir, status, detail), {
      label: `resume ${label}`,
      phase: 'Run',
      model: 'sonnet',
    })
    break
  }

  return status
}

// One run's failure must not drop the rest of its queue.
async function runOne(run) {
  const label = `${run.model}-${run.lang}`
  let status = 'error'
  try {
    status = await executeRun(run)
  } catch (err) {
    log(`${label}: error: ${errorText(err)}`)
    status = 'error'
  }
  results.push({ model: run.model, lang: run.lang, status })
  log(`${label}: ${status}`)
}

const queued = { local: [], cloud: [] }
for (const run of runs) {
  const queue = MODEL_QUEUES[run.model]
  if (!queue) {
    log(`unknown model ${run.model}, skipped`)
    results.push({ model: run.model, lang: run.lang, status: 'skipped' })
    continue
  }
  queued[queue].push(run)
}

phase('Run')
await parallel(
  QUEUE_NAMES.map((name) => async () => {
    for (const run of queued[name]) {
      await runOne(run)
    }
  }),
)

phase('Review')
const reviewResults = await Promise.all(reviews)
log(`reviews finished: ${reviewResults.filter(Boolean).length}/${reviews.length}`)

if (withSummary) {
  phase('Summary')
  await agentLogged(summaryPrompt(results), {
    label: 'summary',
    phase: 'Summary',
    model: 'sonnet',
  })
} else {
  log('summary skipped (args.summary is not true)')
}

return {
  runs: results.map((r) => ({ model: r.model, lang: r.lang, status: r.status })),
}
