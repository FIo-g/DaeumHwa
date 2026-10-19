// Character speech style (spec 8, track B). Off by default: the feature runs only when the
// AI_SPEECH_STYLE env flag is on. Pure helpers, no DB.

export const SPEECH_STYLE_ENV = 'AI_SPEECH_STYLE'
/** Most characters the draft prompt carries in its <voices> block. */
export const MAIN_VOICE_LIMIT = 6
const SPEECH_MAX_CHARS = 200

/** Read at call time, never cached: a test or a deployment can flip the flag. */
export function isSpeechStyleEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env[SPEECH_STYLE_ENV]?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'on'
}

export type VoiceSource = {
  entryId: string
  name: string
  speech: string
  /** The author selected this entry for the draft. */
  selected: boolean
  createdAt: Date
}

export type VoiceLine = { entryId: string; name: string; speech: string }

/** Whitespace runs become single spaces; the text is cut at `max` characters with an ellipsis. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : flat
}

/**
 * Characters with a speech style, selected first, then oldest first, capped at `limit`. Entries
 * without speech are dropped.
 */
export function selectMainVoices(sources: VoiceSource[], limit = MAIN_VOICE_LIMIT): VoiceLine[] {
  return sources
    .filter((source) => source.speech.trim() !== '')
    .sort(
      (a, b) =>
        Number(b.selected) - Number(a.selected) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0),
    )
    .slice(0, limit)
    .map((source) => ({
      entryId: source.entryId,
      name: source.name,
      speech: oneLine(source.speech, SPEECH_MAX_CHARS),
    }))
}

/** One "- name: speech" line per voice, or "(없음)" when there are none. */
export function renderVoiceLines(lines: Pick<VoiceLine, 'name' | 'speech'>[]): string {
  if (lines.length === 0) return '(없음)'
  return lines.map((line) => `- ${line.name}: ${line.speech}`).join('\n')
}
