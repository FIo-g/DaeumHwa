// CLI for the read-only threshold replay (eval/novel/thresholds.ts). Reads saved run folders,
// writes only the --out report and never calls a model. Run from the repo root:
//   pnpm exec tsx eval/novel/thresholds-cli.ts [--date 2026-10-18] [--results eval/results/novel]
//     [--runs a,b,c] [--out <file>]

import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReport } from './thresholds'
import { DEFAULT_RUNS } from './thresholds-labels'

const CLI_PATH = fileURLToPath(import.meta.url)

type Options = { date: string; results: string; runs: string[]; out?: string }

function parseArgs(argv: string[]): Options {
  const options: Options = {
    date: '2026-10-18',
    results: 'eval/results/novel',
    runs: [...DEFAULT_RUNS],
  }
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`missing value for ${flag}`)
    if (flag === '--date') options.date = value
    else if (flag === '--results') options.results = value
    else if (flag === '--runs')
      options.runs = value
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    else if (flag === '--out') options.out = value
    else throw new Error(`unknown option: ${flag}`)
  }
  return options
}

/** Prints one JSON line `{ out, decisions, pack }`, or writes the Markdown to stdout without --out. */
export function main(argv: string[]): number {
  try {
    const options = parseArgs(argv)
    const resultsDir = path.resolve(options.results)
    const outPath = options.out ? path.resolve(options.out) : undefined
    if (outPath && (outPath + path.sep).startsWith(resultsDir + path.sep)) {
      throw new Error('refusing to write inside the results folder')
    }
    const report = buildReport({
      resultsDir,
      date: options.date,
      runs: options.runs,
    })
    if (!outPath) {
      process.stdout.write(report.markdown)
      return 0
    }
    mkdirSync(path.dirname(outPath), { recursive: true })
    writeFileSync(outPath, report.markdown, 'utf8')
    process.stdout.write(
      `${JSON.stringify({ out: options.out, decisions: report.decisions, pack: report.pack })}\n`,
    )
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stdout.write(`${JSON.stringify({ error: message })}\n`)
    return 1
  }
}

function isEntry(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(CLI_PATH)
  } catch {
    return false
  }
}

if (isEntry()) {
  process.exitCode = main(process.argv.slice(2))
}
