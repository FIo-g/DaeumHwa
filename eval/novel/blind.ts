import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { CallRecord } from './eval-client'
import { MODEL_PROFILES } from './models'
import { loadConfig } from './state'

// Blinded copy of one finished run, for the reviewer. The reviewer must not learn which model
// produced the run, so every model name, provider word and profile fingerprint is masked or dropped
// in the copy. The stored run is never changed.

export const BLIND_LABEL = '[masked]' as const

export type BlindedCall = Omit<
  CallRecord,
  'model' | 'effortRequested' | 'maxTokens' | 'productTimeoutMs' | 'speed'
> & { model: typeof BLIND_LABEL }

const VARIANT_SUFFIX = /-(mlx|gguf)$/

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every spelling a model id can take: the id, the API or Ollama name, and the base Ollama tag. */
export function modelNeedles(): string[] {
  const needles = new Set<string>()
  for (const profile of Object.values(MODEL_PROFILES)) {
    if (profile.id === 'fake') continue
    needles.add(profile.id)
    needles.add(profile.model)
    needles.add(profile.id.replace(/\./g, '-'))
    // Ollama prints the base tag (qwen3.8:27b), not the -mlx or -gguf variant.
    needles.add(profile.model.replace(VARIANT_SUFFIX, ''))
  }
  // Longest first, so a longer name is masked whole before a shorter part of it.
  return [...needles].sort((a, b) => b.length - a.length || a.localeCompare(b))
}

const MODEL_PATTERN = new RegExp(modelNeedles().map(escapeRegExp).join('|'), 'gi')
const PROVIDER_PATTERN = /ollama|opencode/gi
// Claude followed by a version (Claude v1.3) is a literature citation in the criteria doc, not a model.
const BRAND_PATTERN =
  /(?<![A-Za-z])(?:Claude(?!\s+v\d)|Anthropic|Qwen|EXAONE|Sonnet|Opus|Haiku|gpt-oss)(?![A-Za-z])/gi
const REFERENCE_PATTERN = /(?<![A-Za-z])(?:Haiku|Luna|Sonnet|Opus|Qwen|EXAONE|gpt-oss)(?![A-Za-z])/gi
const REFERENCE_LABEL = '[모델]'

/** Replaces every model id, tag and base tag (any case) with the label. */
export function maskModelNames(text: string): string {
  return text.replace(MODEL_PATTERN, BLIND_LABEL)
}

/** Replaces the provider words ollama and opencode (any case). */
export function maskProviderNames(text: string): string {
  return text.replace(PROVIDER_PATTERN, BLIND_LABEL)
}

/** Replaces brand words that a model may use to name itself in output. */
export function maskBrandWords(text: string): string {
  return text.replace(BRAND_PATTERN, BLIND_LABEL)
}

/** Masks everything that is operational text: model ids, provider words and brand words. */
export function maskOperationalText(text: string): string {
  return maskBrandWords(maskProviderNames(maskModelNames(text)))
}

/** Masks a reference doc: operational masking, plus Luna (a model name that is also a character name elsewhere). */
export function maskReferenceText(text: string): string {
  return maskOperationalText(text).replace(REFERENCE_PATTERN, REFERENCE_LABEL)
}

/** Deep-masks every string (values and keys) in a JSON-shaped value. Returns a new value. */
function maskDeep(value: unknown): unknown {
  if (typeof value === 'string') return maskOperationalText(value)
  if (Array.isArray(value)) return value.map(maskDeep)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [maskOperationalText(key), maskDeep(item)]),
    )
  }
  return value
}

/**
 * One call record for the reviewer. The model field is replaced by the label, the profile
 * fingerprints (effort, token cap, timeout, speed) are dropped, and every string is masked.
 * wouldTimeOut stays, because the operations score needs it. The input is not changed.
 */
export function blindCallRecord(call: CallRecord): BlindedCall {
  const masked = maskDeep(call) as Record<string, unknown>
  delete masked.effortRequested
  delete masked.maxTokens
  delete masked.productTimeoutMs
  delete masked.speed
  return { ...masked, model: BLIND_LABEL } as BlindedCall
}

/** Any state or log JSON: every string masked. */
export function blindJson(value: unknown): unknown {
  return maskDeep(value)
}

/** The run summary without its speed block (speed is the profile fingerprint the reviewer must not see). */
export function blindRunSummary(summary: unknown): unknown {
  const masked = maskDeep(summary) as Record<string, unknown>
  delete masked.speed
  return masked
}

/** Where the blinded copy of a run goes: the sibling blind/ folder with the same run name. */
export function defaultBlindDir(runDir: string): string {
  return path.join(path.dirname(runDir), 'blind', path.basename(runDir))
}
