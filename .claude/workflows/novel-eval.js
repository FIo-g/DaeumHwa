export const meta = {
  name: 'novel-eval',
  description:
    'Run the novel quality eval per model and language: advance each run, let author agents answer pending items, then write reviews and a summary',
  whenToUse:
    'DaeumHwa lightweight-model novel eval (eval/novel). Requires args.date (YYYY-MM-DD). Resume by rerunning with the same date and runs.',
  phases: [
    { title: 'Run', detail: 'init and advance each run; author agents answer pending items' },
    { title: 'Review', detail: 'Sonnet reviewer per finished run, started as runs finish' },
    { title: 'Summary', detail: 'cross-run summary after all reviews' },
  ],
}

const REPO = '/Users/taehyeong/Documents/GitHub/DaeumHwa'
const ALL_MODELS = ['qwen3.8-27b', 'gpt-oss-20b', 'exaone3.5-32b', 'haiku-5.5', 'luna-6']
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

const RUNNER_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['status', 'detail'],
}

if (!args || typeof args.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
  throw new Error('args.date (YYYY-MM-DD) is required')
}
const date = args.date
const chapters = args.chapters || 5
const runs =
  Array.isArray(args.runs) && args.runs.length > 0
    ? args.runs
    : ALL_MODELS.flatMap((model) => LANGS.map((lang) => ({ model, lang })))

const runDir = (run) => `eval/results/novel/${date}-${run.model}-${run.lang}`
const reviewPath = (run) => `docs/eval/novel/${date}/${run.model}-${run.lang}.md`
const safe = (promise) => promise.catch(() => null)

function runnerPrompt(run, dir, first) {
  const initStep = first
    ? [
        'Step 1. Run this command once, from the repository root:',
        `  cd ${REPO} && pnpm eval:novel init --model ${run.model} --lang ${run.lang} --chapters ${chapters} --dir ${dir}`,
        'If it fails, return status "blocked" and the error text as detail, and stop.',
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
    'If status is "running", run the same advance command again.',
    'Run advance at most 20 times in this invocation. Stop as soon as status is not "running".',
    '',
    'Return:',
    '- status: the "status" value from the last JSON line (or "running" if you hit the 20-call limit).',
    '- detail: the last JSON line verbatim (or the error text if a command failed).',
  ].join('\n')
}

function authorPrompt(dir, lang) {
  return [
    `Follow the instructions in ${REPO}/eval/novel/agents/author.md.`,
    `Inputs: dir = ${REPO}/${dir}, lang = ${lang}.`,
    'Answer the pending item in dir and write answer.json as the instructions say.',
  ].join('\n')
}

function reviewerPrompt(run, dir) {
  return [
    `Follow the instructions in ${REPO}/eval/novel/agents/reviewer.md.`,
    `Inputs: dir = ${REPO}/${dir}, lang = ${run.lang}, reviewPath = ${REPO}/${reviewPath(run)}.`,
    'Write the review document at reviewPath.',
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
    if (r.status === 'done') item.reviewPath = `${REPO}/${reviewPath(r)}`
    else item.resumePath = `${REPO}/${dir}/RESUME.md`
    return item
  })
  return [
    `Follow the instructions in ${REPO}/eval/novel/agents/summary.md.`,
    `Inputs: date = ${date}, runs = ${JSON.stringify(list)}.`,
    `Write ${REPO}/docs/eval/novel/${date}/summary.md as the instructions say.`,
  ].join('\n')
}

const reviews = []
const results = []

async function executeRun(run) {
  const dir = runDir(run)
  const label = `${run.model}-${run.lang}`
  let first = true
  let status = 'running'
  let iterations = 0

  while (true) {
    if (iterations >= MAX_LOOP_ITERATIONS) {
      log(`${label}: loop limit of ${MAX_LOOP_ITERATIONS} iterations hit`)
      status = 'iteration-limit'
      await safe(
        agent(resumePrompt(run, dir, status, 'workflow loop limit reached'), {
          label: `resume ${label}`,
          phase: 'Run',
          model: 'sonnet',
        }),
      )
      break
    }
    iterations++

    const step = await agent(runnerPrompt(run, dir, first), {
      label: `run ${label}`,
      phase: 'Run',
      model: 'haiku',
      schema: RUNNER_SCHEMA,
    })
    first = false
    status = step && typeof step.status === 'string' ? step.status.trim() : 'blocked'
    const detail =
      step && typeof step.detail === 'string' ? step.detail : 'runner agent returned no result'

    if (status === 'running') continue

    if (status === 'pending') {
      await safe(
        agent(authorPrompt(dir, run.lang), {
          label: `author ${label}`,
          phase: 'Run',
          model: 'sonnet',
        }),
      )
      continue
    }

    if (status === 'done') {
      reviews.push(
        safe(
          agent(reviewerPrompt(run, dir), {
            label: `review ${label}`,
            phase: 'Review',
            model: 'sonnet',
          }),
        ),
      )
      break
    }

    // paused-limit, paused-error, blocked, or anything unexpected
    await safe(
      agent(resumePrompt(run, dir, status, detail), {
        label: `resume ${label}`,
        phase: 'Run',
        model: 'sonnet',
      }),
    )
    break
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
      await executeRun(run)
    }
  }),
)

phase('Review')
const reviewResults = await Promise.all(reviews)
log(`reviews finished: ${reviewResults.filter(Boolean).length}/${reviews.length}`)

phase('Summary')
await safe(
  agent(summaryPrompt(results), {
    label: 'summary',
    phase: 'Summary',
    model: 'sonnet',
  }),
)

return {
  runs: results.map((r) => ({ model: r.model, lang: r.lang, status: r.status })),
}
