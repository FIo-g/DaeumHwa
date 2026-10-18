// Framing of the streamed chapter draft (POST /api/works/[workId]/draft). The route and the draft
// panel both import it from here, so the two sides cannot drift apart.

/** Marks the start of the final error record. It never appears in draft text. */
export const DRAFT_ERROR_MARK = '\u001e'

/** Shown when the draft failed and the server message is not known to be safe to show. */
export const DRAFT_FAILED_MESSAGE = '초안 작성이 중간에 끊겼습니다. 다시 시도해 주세요.'

/** The record appended after the text when a draft fails mid-way: MARK followed by {"error": "..."}. */
export function draftErrorRecord(message: string): string {
  return `${DRAFT_ERROR_MARK}${JSON.stringify({ error: message })}`
}

/**
 * Splits the streamed text into the draft and the error record, if any. `text` is the draft
 * without the record. A record that is incomplete or malformed still counts as a failure.
 */
export function parseDraftStream(raw: string): { text: string; error: string | null } {
  const at = raw.indexOf(DRAFT_ERROR_MARK)
  if (at === -1) return { text: raw, error: null }
  return { text: raw.slice(0, at), error: errorOfRecord(raw.slice(at + DRAFT_ERROR_MARK.length)) }
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
