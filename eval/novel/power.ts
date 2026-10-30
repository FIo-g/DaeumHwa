import { execFileSync } from 'node:child_process'

// Machine power source and energy mode, read with pmset on macOS (track M1). Pure parsers plus one
// reader that can be injected. Imports nothing from eval/novel, so every eval file can use it.

export type PowerSource = 'ac' | 'battery' | 'ups' | 'unknown'
export type EnergyMode = 'low' | 'automatic' | 'high' | 'unknown'
/** modeRaw is the pmset line as read (single spaces), or null when no key was found. */
export type PowerInfo = { source: PowerSource; mode: EnergyMode; modeRaw: string | null }
export type PowerReader = () => PowerInfo

export const UNKNOWN_POWER: Readonly<PowerInfo> = Object.freeze({
  source: 'unknown',
  mode: 'unknown',
  modeRaw: null,
})

/**
 * What `pmset -g` `powermode <n>` means. 1 is Low Power (spec section 7). 0 and 2 are the common
 * reading (automatic, high) and are not verified on this Mac; only `low` triggers a warning.
 */
const POWERMODE_MODES: Record<number, EnergyMode> = { 0: 'automatic', 1: 'low', 2: 'high' }

const SOURCE_NAMES: Record<string, PowerSource> = {
  'AC Power': 'ac',
  'Battery Power': 'battery',
  'UPS Power': 'ups',
}

/** Power source from the first line of `pmset -g batt`. */
export function parsePowerSource(batt: string): PowerSource {
  const name = /Now drawing from '([^']+)'/.exec(batt)?.[1]
  return (name !== undefined ? SOURCE_NAMES[name] : undefined) ?? 'unknown'
}

/**
 * Energy mode from `pmset -g` text. Only the `Currently in use:` block counts when it is there.
 * A `lowpowermode 1` line wins, then `powermode <n>`, then `lowpowermode 0`.
 */
export function parseEnergyMode(text: string): { mode: EnergyMode; modeRaw: string | null } {
  const marker = text.indexOf('Currently in use:')
  const scope = marker >= 0 ? text.slice(marker) : text
  const lines = [...scope.matchAll(/^\s*(lowpowermode|powermode)\s+(\d+)\b/gm)].map((match) => ({
    key: match[1] ?? '',
    value: Number(match[2]),
  }))
  const lowOn = lines.find((line) => line.key === 'lowpowermode' && line.value === 1)
  if (lowOn) return { mode: 'low', modeRaw: 'lowpowermode 1' }
  const power = lines.find((line) => line.key === 'powermode')
  if (power) {
    return {
      mode: POWERMODE_MODES[power.value] ?? 'unknown',
      modeRaw: `powermode ${power.value}`,
    }
  }
  const lowOff = lines.find((line) => line.key === 'lowpowermode' && line.value === 0)
  if (lowOff) return { mode: 'automatic', modeRaw: 'lowpowermode 0' }
  return { mode: 'unknown', modeRaw: null }
}

/** Runs pmset with the given arguments and returns its standard output. */
export type PmsetRunner = (args: string[]) => string

const defaultRunner: PmsetRunner = (args) =>
  execFileSync('/usr/bin/pmset', args, {
    encoding: 'utf8',
    timeout: 3000,
    stdio: ['ignore', 'pipe', 'ignore'],
  })

/**
 * Reads the power source and energy mode now. Off macOS it reads nothing. Each pmset call is
 * guarded on its own, so one failure keeps the other value. Never throws.
 */
export function readPowerInfo(
  deps: { run?: PmsetRunner; platform?: NodeJS.Platform } = {},
): PowerInfo {
  const platform = deps.platform ?? process.platform
  if (platform !== 'darwin') return { ...UNKNOWN_POWER }
  const run = deps.run ?? defaultRunner
  let source: PowerSource = 'unknown'
  let mode: { mode: EnergyMode; modeRaw: string | null } = { mode: 'unknown', modeRaw: null }
  try {
    source = parsePowerSource(run(['-g', 'batt']))
  } catch {
    // Keeps the unknown source; the mode read below still runs.
  }
  try {
    mode = parseEnergyMode(run(['-g']))
  } catch {
    // Keeps the unknown mode.
  }
  return { source, ...mode }
}

export type PowerSummary = {
  sampled: number
  lowPower: number
  onBattery: number
  byMode: Record<string, number>
  bySource: Record<string, number>
}

/** Counts over the sampled calls of a run. Null when nothing was sampled. */
export function powerSummary(samples: readonly PowerInfo[]): PowerSummary | null {
  if (samples.length === 0) return null
  const byMode: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  for (const sample of samples) {
    byMode[sample.mode] = (byMode[sample.mode] ?? 0) + 1
    bySource[sample.source] = (bySource[sample.source] ?? 0) + 1
  }
  return {
    sampled: samples.length,
    lowPower: samples.filter((sample) => sample.mode === 'low').length,
    onBattery: samples.filter((sample) => sample.source === 'battery').length,
    byMode,
    bySource,
  }
}

/**
 * Warning text for the status line, or null. It names the live Low Power reading and any recorded
 * call that started in Low Power. A mode of unknown never warns.
 */
export function lowPowerWarning(o: {
  live: PowerInfo | null
  samples: readonly PowerInfo[]
}): string | null {
  const liveLow = o.live?.mode === 'low'
  const lowCalls = o.samples.filter((sample) => sample.mode === 'low').length
  if (!liveLow && lowCalls === 0) return null
  const parts: string[] = []
  if (liveLow) parts.push('The Mac is in Low Power energy mode now.')
  if (lowCalls > 0) {
    parts.push(
      `${lowCalls} of ${o.samples.length} recorded local calls started in Low Power energy mode.`,
    )
  }
  return `${parts.join(' ')} Local speed and time numbers are not comparable until the Energy Mode is Automatic or High Power.`
}
