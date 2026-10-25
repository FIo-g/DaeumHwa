import { checkDraftDirectives } from '@/lib/directive-check'
import type { DirectiveForPrompt } from '@/lib/directives'
import { draftCharCount } from '@/lib/draft-length'
import { CLICHES } from '@/lib/korean/cliches'
import { splitParagraphs } from '@/lib/korean/paragraphs'
import type { DraftPlanCard } from '@/lib/draft-plan'
import type { SceneRange } from '@/lib/scene'

// Code checks that find the weak scenes of a finished draft (stage 3, task 1). Pure: no DB, no
// AI. Only the code-owned reasons are produced here; the AI check owns the rest.

/** Every reason a scene finding can have, code-owned or AI-owned. */
export type SceneReason =
  | 'missing-event'
  | 'request'
  | 'leak'
  | 'skipped-moment'
  | 'unmotivated-feeling'
  | 'flat-ending'
  | 'summary-ending'
  | 'repeated-beat'
  | 'cliche'
  | 'repeat'
  | 'scene-length'

/** Most severe first. The fix order follows this list. */
export const REASON_PRIORITY: SceneReason[] = [
  'missing-event',
  'request',
  'leak',
  'skipped-moment',
  'unmotivated-feeling',
  'flat-ending',
  'summary-ending',
  'repeated-beat',
  'cliche',
  'repeat',
  'scene-length',
]

export const REASON_LABELS: Record<SceneReason, string> = {
  'missing-event': '지시한 사건이 빠짐',
  request: '요청과 다름',
  leak: '공개 전 비밀이 드러남',
  'skipped-moment': '중요한 순간을 설명으로 넘김',
  'unmotivated-feeling': '계기 없는 감정 변화',
  'flat-ending': '회차 끝이 밋밋함',
  'summary-ending': '요약으로 끝남',
  'repeated-beat': '같은 흐름 반복',
  cliche: '상투 표현 반복',
  repeat: '같은 표현 반복',
  'scene-length': '장면 분량이 계획과 다름',
}

/** One weak scene. `scene` is 1-based. */
export type SceneFinding = { scene: number; reason: SceneReason; note: string }

/** Reasons too weak to pick a scene for a fix on their own. */
const WEAK_REASONS: SceneReason[] = ['cliche', 'repeat', 'scene-length']

const SUMMARY_MARKERS_KO = [
  '결국',
  '마침내',
  '그렇게',
  '이렇게',
  '앞으로',
  '깨달았다',
  '다짐했다',
  '것이다.',
  '시작이었다',
  '알 수 있었다',
]

const SUMMARY_MARKERS_EN = [
  'finally',
  'in the end',
  'realized',
  'would never',
  'was only the beginning',
  'knew that',
]

const QUOTE_RE = /["“”「」『』‘’]/
const EDGE_PUNCT_RE =
  /^[.,!?;:'"“”‘’「」『』()[\]{}…~—–\-·/*_\\|@#$%^&+=<>]+|(?:[.,!?;:'"“”‘’「」『』()[\]{}…~—–\-·/*_\\|@#$%^&+=<>])+$/g

/**
 * The code-owned findings of a draft: request hits, repeated cliches, repeated 3-grams, scenes
 * off their card target, and a summary-like ending. `spans` must cover the draft's paragraphs;
 * `card` is null when the draft was written without a plan card.
 */
export function codeSceneFindings(
  text: string,
  o: {
    spans: SceneRange[]
    requests: DirectiveForPrompt[]
    names: Record<string, string[]>
    card: DraftPlanCard | null
  },
): SceneFinding[] {
  if (o.spans.length === 0) return []
  const paragraphs = splitParagraphs(text)
  const byParagraph = new Map(paragraphs.map((p) => [p.index, sceneOf(o.spans, p.start)]))
  const findings: SceneFinding[] = []

  for (const finding of requestFindings(text, o.requests, o.names, byParagraph)) {
    findings.push(finding)
  }
  for (const [scene, phrases] of clicheHits(text, o.spans)) {
    findings.push({ scene, reason: 'cliche', note: phrases.join(', ') })
  }
  for (const [scene, gram] of repeatHits(text, o.spans)) {
    findings.push({ scene, reason: 'repeat', note: gram })
  }
  if (o.card !== null && o.card.scenes.length === o.spans.length) {
    o.card.scenes.forEach((scene, i) => {
      const chars = draftCharCount(text.slice(o.spans[i].start, o.spans[i].end))
      const target = scene.targetChars
      if (target > 0 && (chars < target * 0.6 || chars > target * 1.4)) {
        findings.push({ scene: i + 1, reason: 'scene-length', note: `${chars}/${target}자` })
      }
    })
  }
  const ending = summaryEnding(text, o.spans.length)
  if (ending !== null) findings.push(ending)

  const seen = new Set<string>()
  return findings.filter((f) => {
    const key = `${f.scene}|${f.reason}|${f.note}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Scenes to fix, most severe first: ordered by their most severe reason, then by finding count,
 * then by scene number. A scene with only weak reasons is never picked.
 */
export function pickScenes(findings: SceneFinding[], max = 2): number[] {
  const byScene = new Map<number, SceneFinding[]>()
  for (const finding of findings) {
    byScene.set(finding.scene, [...(byScene.get(finding.scene) ?? []), finding])
  }
  const severity = (scene: SceneFinding[]): number =>
    Math.min(...scene.map((f) => REASON_PRIORITY.indexOf(f.reason)))
  return [...byScene.entries()]
    .filter(([, scene]) => scene.some((f) => !WEAK_REASONS.includes(f.reason)))
    .sort((a, b) => severity(a[1]) - severity(b[1]) || b[1].length - a[1].length || a[0] - b[0])
    .slice(0, Math.max(0, max))
    .map(([scene]) => scene)
}

/** The 1-based scene holding `offset`, or the last scene when the offset is at the very end. */
function sceneOf(spans: SceneRange[], offset: number): number {
  const index = spans.findIndex((span) => span.start <= offset && offset < span.end)
  return index === -1 ? spans.length : index + 1
}

/** One request finding per hit scene: `'{pattern}'` for a ban, `{name} 말투` for speech. */
function requestFindings(
  text: string,
  requests: DirectiveForPrompt[],
  names: Record<string, string[]>,
  byParagraph: Map<number, number>,
): SceneFinding[] {
  const byId = new Map(requests.map((d) => [d.id, d]))
  const findings: SceneFinding[] = []
  for (const result of checkDraftDirectives(text, requests, names)) {
    const directive = byId.get(result.directiveId)
    if (directive === undefined) continue
    const note =
      result.kind === 'speech'
        ? `${directive.entryName ?? names[directive.entryId ?? '']?.[0] ?? directive.entryId} 말투`
        : `'${directive.pattern}'`
    for (const paragraph of result.paragraphs) {
      const scene = byParagraph.get(paragraph)
      if (scene !== undefined) findings.push({ scene, reason: 'request', note })
    }
  }
  return findings
}

/** Scenes with 2 or more cliche hits, with the phrases that hit. Both language lists apply. */
function clicheHits(text: string, spans: SceneRange[]): [number, string[]][] {
  const lists = [...CLICHES.ko, ...CLICHES.en]
  const out: [number, string[]][] = []
  spans.forEach((span, i) => {
    const scene = text.slice(span.start, span.end)
    const phrases = lists
      .filter(({ pattern }) => {
        pattern.lastIndex = 0
        return pattern.test(scene)
      })
      .map(({ phrase }) => phrase)
    const hits = lists.reduce(
      (count, { pattern }) => count + (scene.match(pattern) ?? []).length,
      0,
    )
    if (hits >= 2 && phrases.length > 0) out.push([i + 1, phrases])
  })
  return out
}

type Token = { text: string; offset: number }

/** Whitespace tokens with edge punctuation trimmed and Latin lowercased. */
function chapterTokens(text: string): Token[] {
  const tokens: Token[] = []
  for (const match of text.matchAll(/\S+/g)) {
    EDGE_PUNCT_RE.lastIndex = 0
    const cleaned = match[0].replace(EDGE_PUNCT_RE, '').toLowerCase()
    if (cleaned !== '') tokens.push({ text: cleaned, offset: match.index ?? 0 })
  }
  return tokens
}

/**
 * A 3-gram seen 3 or more times in the chapter: one hit per scene holding its second or later
 * occurrence, at most 3 per scene. The most repeated grams win; ties break by first occurrence.
 * Dialogue counts, since it is part of the token stream.
 */
function repeatHits(text: string, spans: SceneRange[]): [number, string][] {
  const tokens = chapterTokens(text)
  const positions = new Map<string, number[]>()
  for (let i = 0; i + 2 < tokens.length; i++) {
    const gram = `${tokens[i].text} ${tokens[i + 1].text} ${tokens[i + 2].text}`
    positions.set(gram, [...(positions.get(gram) ?? []), tokens[i].offset])
  }
  const byScene = new Map<number, { gram: string; count: number; first: number }[]>()
  const seen = new Set<string>()
  for (const [gram, offsets] of positions) {
    if (offsets.length < 3) continue
    for (const offset of offsets.slice(1)) {
      const scene = sceneOf(spans, offset)
      const key = `${scene}|${gram}`
      if (seen.has(key)) continue
      seen.add(key)
      const list = byScene.get(scene) ?? []
      list.push({ gram, count: offsets.length, first: offsets[0] })
      byScene.set(scene, list)
    }
  }
  const out: [number, string][] = []
  for (const [scene, grams] of byScene) {
    grams
      .sort((a, b) => b.count - a.count || a.first - b.first)
      .slice(0, 3)
      .forEach(({ gram }) => out.push([scene, gram]))
  }
  return out
}

/** A finding in the last scene when the last paragraph summarizes instead of ending the story. */
function summaryEnding(text: string, sceneCount: number): SceneFinding | null {
  const paragraphs = splitParagraphs(text)
  const last = paragraphs[paragraphs.length - 1]
  if (last === undefined || QUOTE_RE.test(last.text)) return null
  const lowered = last.text.toLowerCase()
  const markers = [
    ...SUMMARY_MARKERS_KO.filter((marker) => last.text.includes(marker)),
    ...SUMMARY_MARKERS_EN.filter((marker) => lowered.includes(marker)),
  ]
  if (markers.length < 2) return null
  return { scene: sceneCount, reason: 'summary-ending', note: markers.join(', ') }
}
