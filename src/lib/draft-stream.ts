// Framing of the streamed chapter draft (POST /api/works/[workId]/draft). The route and the draft
// panel both import it from here, so the two sides cannot drift apart.

/** Marks the start of the final error record. It never appears in draft text. */
export const DRAFT_ERROR_MARK = '\u001e'

/**
 * Brackets a replace record: MARK, {"text": "..."}, MARK. The text replaces every streamed text
 * before it. JSON.stringify escapes control characters, so the mark never appears inside the JSON.
 */
export const DRAFT_REPLACE_MARK = '\u001d'

/** Shown when the draft failed and the server message is not known to be safe to show. */
export const DRAFT_FAILED_MESSAGE = '초안 작성이 중간에 끊겼습니다. 다시 시도해 주세요.'

/** The record appended after the text when a draft fails mid-way: MARK followed by {"error": "..."}. */
export function draftErrorRecord(message: string): string {
  return `${DRAFT_ERROR_MARK}${JSON.stringify({ error: message })}`
}

/** The record that replaces the streamed text with `text` (for example, an expanded draft). */
export function draftReplaceRecord(text: string): string {
  return `${DRAFT_REPLACE_MARK}${JSON.stringify({ text })}${DRAFT_REPLACE_MARK}`
}

/**
 * Splits the streamed text into the draft and the error record, if any. `text` is the draft
 * without the records. A record that is incomplete or malformed still counts as a failure.
 */
export function parseDraftStream(raw: string): { text: string; error: string | null } {
  const at = raw.indexOf(DRAFT_ERROR_MARK)
  if (at === -1) return { text: draftTextOf(raw), error: null }
  return {
    text: draftTextOf(raw.slice(0, at)),
    error: errorOfRecord(raw.slice(at + DRAFT_ERROR_MARK.length)),
  }
}

/**
 * The draft text of the streamed body. The last complete replace record wins; with none, the
 * streamed text is returned without the records. An incomplete trailing replace record is dropped.
 */
function draftTextOf(body: string): string {
  let streamed = ''
  let replaced: string | null = null
  let index = 0
  while (true) {
    const open = body.indexOf(DRAFT_REPLACE_MARK, index)
    if (open === -1) return replaced ?? streamed + body.slice(index)
    const close = body.indexOf(DRAFT_REPLACE_MARK, open + 1)
    if (close === -1) return replaced ?? streamed + body.slice(index, open)
    streamed += body.slice(index, open)
    replaced = replacedTextOf(body.slice(open + 1, close)) ?? replaced
    index = close + 1
  }
}

/** The text of a replace record's payload, or null when it is not valid. */
function replacedTextOf(payload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(payload)
    if (typeof parsed === 'object' && parsed !== null && 'text' in parsed) {
      const text = (parsed as { text: unknown }).text
      if (typeof text === 'string') return text
    }
  } catch {
    // Not valid JSON: the record is ignored.
  }
  return null
}

function errorOfRecord(payload: string): string {
  try {
    const parsed: unknown = JSON.parse(payload)
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const message = (parsed as { error: unknown }).error
      if (typeof message === 'string' && message !== '') return message
    }
  } catch {
    // Not valid JSON: fall through to the generic message.
  }
  return DRAFT_FAILED_MESSAGE
}
