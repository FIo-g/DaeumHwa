import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../.claude/workflows/novel-eval.js', import.meta.url),
  'utf8',
)
const agentsDir = fileURLToPath(new URL('./agents/', import.meta.url))
const DEFAULT_REPO = '/Users/taehyeong/Documents/GitHub/DaeumHwa'
const REPO = '/tmp/worktrees/DaeumHwa-r2a'
const DATE = '2026-10-19-r2a'

type StepReply = { status: string; detail: string }
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...params: string[]
) => (...values: unknown[]) => Promise<unknown>

/** Replies of the stub agent. `advance` is consumed by successive `pnpm eval:novel advance` commands. */
function reply(prompt: string, advance: StepReply[]): unknown {
  if (prompt.startsWith('Follow the instructions in')) return 'ok' // author, reviewer, resume-note, summary
  if (prompt.includes('eval:novel advance'))
    return advance.shift() ?? { status: 'done', detail: '{}' }
  if (prompt.includes('test -f')) return { status: 'exists', detail: '' }
  if (prompt.includes('eval:novel blind')) return { status: 'blinded', detail: 'blind' }
  if (prompt.includes('eval:novel publish-review'))
    return { status: 'copied', detail: '{"docsPath":"x"}' }
  if (prompt.includes('eval:novel review-gate')) return { status: 'not-needed', detail: '{}' }
  return { status: 'copied', detail: '{}' } // publish
}

/** Runs the workflow text offline. Returns the prompts of every agent call, the logs and the result. */
async function runWorkflow(args: Record<string, unknown>, advance: StepReply[] = []) {
  const prompts: string[] = []
  const logs: string[] = []
  const queue = [...advance]
  const agent = async (prompt: string) => {
    prompts.push(prompt)
    return reply(prompt, queue)
  }
  const parallel = (thunks: Array<() => Promise<unknown>>) => Promise.all(thunks.map((t) => t()))
  const body = source.replace('export const meta =', 'const meta =')
  const run = new AsyncFunction('args', 'log', 'phase', 'parallel', 'agent', body)
  const result = await run(
    args,
    (m: string) => void logs.push(m),
    () => {},
    parallel,
    agent,
  )
  return { prompts, logs, result }
}

/** The directory after `cd` in every runner command. */
function cdRoots(prompts: string[]): string[] {
  return prompts.flatMap((p) => [...p.matchAll(/cd (\S+) &&/g)].map((m) => m[1] as string))
}

/** The prompt that contains the given text. Fails the test when none does. */
function promptWith(prompts: string[], text: string): string {
  const found = prompts.find((p) => p.includes(text))
  if (found === undefined) throw new Error(`no prompt contains ${text}`)
  return found
}

const BASE = { date: DATE, runs: [{ model: 'haiku-5.5', lang: 'ko' }], chapters: 1 }
const PENDING: StepReply = {
  status: 'pending',
  detail: '{"step":"interview","pendingKind":"interview_answer"}',
}
const DONE: StepReply = { status: 'done', detail: '{"status":"done"}' }

describe('novel-eval workflow repo root (static)', () => {
  it('names the default repo path once', () => {
    expect((source.match(/\/Users\//g) ?? []).length).toBe(1)
    expect(source).toContain(`const DEFAULT_REPO = '${DEFAULT_REPO}'`)
    expect(source).toContain('const REPO = resolveRepo(args.repo)')
    expect(source.split('export const meta =')).toHaveLength(2)
  })

  it('meta documents args.repo', () => {
    const start = source.indexOf('whenToUse:')
    const end = source.indexOf('phases:')
    expect(start).toBeGreaterThan(-1)
    expect(source.slice(start, end)).toContain('args.repo')
  })

  it('agent instruction files name no checkout path', () => {
    const files = readdirSync(agentsDir).filter((name) => name.endsWith('.md'))
    expect(files.length).toBeGreaterThanOrEqual(4)
    for (const name of files) {
      const content = readFileSync(`${agentsDir}${name}`, 'utf8')
      expect(content, name).not.toContain('/Users/')
      expect(content, name).not.toContain('/home/')
    }
  })

  it('author, resume-note and summary instructions take a root input', () => {
    for (const name of ['author.md', 'resume-note.md', 'summary.md']) {
      expect(readFileSync(`${agentsDir}${name}`, 'utf8'), name).toContain('`root`')
    }
    expect(readFileSync(`${agentsDir}reviewer.md`, 'utf8')).not.toContain('`root`')
  })

  it('resume-note puts the repo into the rerun commands', () => {
    const content = readFileSync(`${agentsDir}resume-note.md`, 'utf8')
    expect(content).toContain('"repo":"<root>"')
    expect(content).toContain('cd <root> &&')
  })
})

describe('novel-eval workflow repo root (offline run)', () => {
  it('uses args.repo in every runner command', async () => {
    const { prompts, result } = await runWorkflow(
      { ...BASE, repo: REPO, rereview: true, summary: true },
      [PENDING, DONE],
    )
    const roots = cdRoots(prompts)
    expect(roots.length).toBeGreaterThan(0)
    for (const root of roots) expect(root).toBe(REPO)
    const all = prompts.join('\n')
    expect(all).not.toContain(DEFAULT_REPO)
    expect(all).not.toContain('/Users/')
    expect(result).toEqual({ runs: [{ model: 'haiku-5.5', lang: 'ko', status: 'done' }] })
  })

  it('points the agents at the instruction files in the repo', async () => {
    const { prompts } = await runWorkflow({ ...BASE, repo: REPO, rereview: true, summary: true }, [
      PENDING,
      DONE,
    ])
    expect(prompts.some((p) => p.includes(`${REPO}/eval/novel/agents/author.md`))).toBe(true)
    expect(prompts.some((p) => p.includes(`${REPO}/eval/novel/agents/reviewer.md`))).toBe(true)
    expect(prompts.some((p) => p.includes(`${REPO}/eval/novel/agents/summary.md`))).toBe(true)
  })

  it('passes root to author and summary but not to the reviewer', async () => {
    const { prompts } = await runWorkflow({ ...BASE, repo: REPO, rereview: true, summary: true }, [
      PENDING,
      DONE,
    ])
    expect(promptWith(prompts, 'agents/author.md')).toContain(
      `root = ${REPO}, dir = ${REPO}/eval/results/novel/${DATE}/run-04-ko`,
    )
    expect(promptWith(prompts, 'agents/summary.md')).toContain(`root = ${REPO}`)
    expect(promptWith(prompts, 'agents/reviewer.md')).not.toContain('root =')
  })

  it('the summary agent reads reviews under the repo root', async () => {
    const { prompts } = await runWorkflow({ ...BASE, repo: REPO, rereview: true, summary: true }, [
      PENDING,
      DONE,
    ])
    const summary = promptWith(prompts, 'agents/summary.md')
    expect(summary).toContain(`${REPO}/docs/eval/novel/${DATE}/`)
    expect(summary).toContain(`${REPO}/docs/eval/novel/${DATE}/second/`)
    expect(summary).toContain(`${REPO}/eval/results/novel/${DATE}/summary.md`)
  })

  it('passes root to the resume-note agent', async () => {
    const { prompts, result } = await runWorkflow({ ...BASE, repo: REPO }, [
      { status: 'paused-limit', detail: 'limit' },
    ])
    expect(promptWith(prompts, 'agents/resume-note.md')).toContain(`root = ${REPO}`)
    expect(result).toEqual({ runs: [{ model: 'haiku-5.5', lang: 'ko', status: 'paused-limit' }] })
  })

  it('falls back to the default repo', async () => {
    const { prompts } = await runWorkflow(BASE, [DONE])
    const roots = cdRoots(prompts)
    expect(roots.length).toBeGreaterThan(0)
    for (const root of roots) expect(root).toBe(DEFAULT_REPO)
    expect(prompts.join('\n')).toContain(
      `cd ${DEFAULT_REPO} && pnpm eval:novel advance --dir eval/results/novel/${DATE}/run-04-ko`,
    )
    expect(prompts.some((p) => p.includes('test -f'))).toBe(true)
  })

  it('treats repo null as the default repo', async () => {
    const { prompts } = await runWorkflow({ ...BASE, repo: null }, [DONE])
    const roots = cdRoots(prompts)
    expect(roots.length).toBeGreaterThan(0)
    for (const root of roots) expect(root).toBe(DEFAULT_REPO)
  })

  it('strips a trailing slash', async () => {
    const { prompts } = await runWorkflow({ ...BASE, repo: `${REPO}/` }, [DONE])
    expect(prompts.join('\n')).toContain(`cd ${REPO} &&`)
    for (const root of cdRoots(prompts)) expect(root).not.toContain('//')
  })

  it.each(['relative/path', '', '/tmp/has space', '/tmp/../etc', '/tmp/x;rm', '/', 42])(
    'rejects an unusable args.repo (%j)',
    async (repo) => {
      await expect(runWorkflow({ date: DATE, runs: [], repo })).rejects.toThrow('args.repo')
    },
  )

  it('accepts a sibling checkout path', async () => {
    const repo = '/Users/taehyeong/Documents/GitHub/DaeumHwa-r2b'
    const { result } = await runWorkflow({ date: DATE, runs: [], repo })
    expect(result).toEqual({ runs: [] })
  })

  it('logs the repo root', async () => {
    const { logs } = await runWorkflow({ ...BASE, repo: REPO }, [DONE])
    expect(logs.some((line) => line.includes(`repo root: ${REPO}`))).toBe(true)
  })
})
