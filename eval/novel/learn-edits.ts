// Simulated author edits for the learn eval (stage 4, task 6). Pure: no DB, no AI.
// After each chapter's draft is applied and before its first save, the harness rewrites the
// draft the way an author with the four probes would: nod and mouth-corner tics are removed,
// Yunseo's last dialogue gets his closing line, and a narration ending gets a dialogue line.

export function applyAuthorEdits(text: string, lang: 'ko' | 'en'): string {
  let out = text
  out = fixBan1(out, lang)
  out = fixBan2(out, lang)
  out = fixTic(out, lang)
  out = fixEnding(out, lang)
  return out
}

function fixBan1(text: string, lang: 'ko' | 'en'): string {
  if (lang === 'ko') {
    // Matched nod clause -> nod-free gaze clause. Two endings are distinguished so the
    // replacement reads naturally; other nod verbs with the same frame map the same way.
    let out = text.replace(
      /고개[를만도]?\s*(?:[^\s.!?…"“”\n]{1,4}\s+){0,2}끄덕(였다|이며)/g,
      (_, ending: string) => (ending === '이며' ? '눈짓하며' : '눈짓했다'),
    )
    out = out.replace(
      /고개[를만도]?\s*(?:[^\s.!?…"“”\n]{1,4}\s+){0,2}주억[^가-힣\s]*거?렸다/g,
      '눈짓했다',
    )
    return out
  }
  let out = text
  out = out.replace(/\bnodded\b/g, 'looked up')
  out = out.replace(/\bNodded\b/g, 'Looked up')
  out = out.replace(/\bnods\b/g, 'looks up')
  out = out.replace(/\bNods\b/g, 'Looks up')
  out = out.replace(/\bnodding\b/g, 'looking up')
  out = out.replace(/\bNodding\b/g, 'Looking up')
  out = out.replace(/\bnod\b/g, 'look up')
  out = out.replace(/\bNod\b/g, 'Look up')
  return out
}

function fixBan2(text: string, lang: 'ko' | 'en'): string {
  if (lang === 'ko') {
    let out = text.replace(/입꼬리가\s+(?:살짝\s+)?올라갔다/g, '웃었다')
    // Other mouth-corner phrases become a stiff expression when the clause has a verb ending in
    // 다/며/고 within three words. Without one, only the phrase leaves the sentence.
    out = out.replace(
      /입꼬리(?:가|를|는|도)?((?:\s+[^\s.!?…\n]+){0,3})/g,
      (_match, tail: string) => {
        if (tail === '') return ''
        const words = tail.trimStart().split(/\s+/)
        const index = words.findIndex((word) => /(다|며|고)$/.test(word))
        if (index === -1) return tail.replace(/^\s+/, '')
        const ending = /(다|며|고)$/.exec(words[index])?.[1]
        if (!ending) return tail.replace(/^\s+/, '')
        const replacement =
          ending === '다' ? '표정이 굳었다' : ending === '며' ? '표정이 굳으며' : '표정이 굳고'
        return [...words.slice(0, index), replacement, ...words.slice(index + 1)].join(' ')
      },
    )
    out = out.replace(/[ \t]{2,}/g, ' ')
    out = out.replace(/\n{3,}/g, '\n\n')
    return out
  }
  let out = text
  out = out.replace(/,\s*for a moment\b/gi, '')
  out = out.replace(/\bfor a moment\s*,/gi, '')
  out = out.replace(/\bfor a moment\b/gi, '')
  out = out.replace(/[ \t]{2,}/g, ' ')
  return out
}

const TIC_NAMES: Record<'ko' | 'en', string[]> = {
  ko: ['도윤서', '윤서'],
  en: ['Do Yunseo', 'Yunseo'],
}

const TIC_PHRASE: Record<'ko' | 'en', string> = {
  ko: '조심하십시오.',
  en: 'Watch your step.',
}

const OTHER_NAMES: Record<'ko' | 'en', string[]> = {
  ko: ['한세린', '세린', '백지원', '한서연', '윤해옥', '곽두석'],
  en: ['Han Serin', 'Serin', 'Baek Jiwon', 'Han Seoyeon', 'Yun Haeok', 'Gwak Duseok'],
}

const QUOTE_RE = /"([^"\n]*)"|“([^”\n]*)”|「([^」\n]*)」|『([^』\n]*)』/g

function narrationOf(paragraph: string): string {
  return paragraph.replace(QUOTE_RE, (m) => ' '.repeat(m.length))
}

function isYunseoDialogue(paragraph: string, lang: 'ko' | 'en'): boolean {
  const quotes = [...paragraph.matchAll(QUOTE_RE)]
  if (quotes.length === 0) return false
  const narration = narrationOf(paragraph)
  const names = TIC_NAMES[lang]
  const others = OTHER_NAMES[lang]
  const hasOwn = names.some((n) => narration.includes(n))
  if (!hasOwn) return false
  if (others.some((n) => narration.includes(n))) return false
  return true
}

function fixTic(text: string, lang: 'ko' | 'en'): string {
  const phrase = TIC_PHRASE[lang]
  const paragraphs = text.split(/\n\s*\n/)
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const para = paragraphs[i] as string
    if (!isYunseoDialogue(para, lang)) continue
    const lower = para.toLowerCase()
    if (lower.includes(phrase.toLowerCase())) return text
    // Append inside the last quoted span.
    let lastIndex = -1
    let lastMatch: RegExpExecArray | null = null
    const re = new RegExp(QUOTE_RE.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(para)) !== null) {
      lastIndex = m.index
      lastMatch = m
    }
    if (!lastMatch) return text
    const full = lastMatch[0]
    const opener = full[0] as string
    const closer = full[full.length - 1] as string
    const inner = full.slice(1, -1)
    const trimmed = inner.trimEnd()
    const next = trimmed.length === 0 ? phrase : `${trimmed} ${phrase}`
    const replaced = `${opener}${next}${closer}`
    paragraphs[i] = `${para.slice(0, lastIndex)}${replaced}${para.slice(lastIndex + full.length)}`
    return paragraphs.join('\n\n')
  }
  return text
}

const DIALOGUE_END_RE: Record<'ko' | 'en', { openers: string[]; closers: string[] }> = {
  ko: { openers: ['“', '"', '「', '『'], closers: ['”', '"', '」', '』'] },
  en: {
    openers: ['“', '"', '「', '『', '‘', "'"],
    closers: ['”', '"', '」', '』', '’', "'"],
  },
}

function endsOnDialogue(text: string, lang: 'ko' | 'en'): boolean {
  const lines = text.split('\n').map((l) => l.trim())
  const last = lines.filter((l) => l !== '').at(-1) ?? ''
  if (last === '') return false
  const { openers, closers } = DIALOGUE_END_RE[lang]
  return openers.some((q) => last.startsWith(q)) && closers.some((q) => last.endsWith(q))
}

/** Trims spaces and the quote marks around a question, keeping any apostrophe inside it. */
function stripQuestionQuotes(text: string): string {
  let out = text.trim()
  for (;;) {
    const next = out.replace(/^["“”「」『』'‘’\s]+|["“”「」『』'‘’\s]+$/g, '')
    if (next === out || next === '') return out
    out = next
  }
}

function lastQuestion(text: string): string | null {
  const matches = text.match(/[^.!?…\n]*\?/g)
  if (!matches || matches.length === 0) return null
  const last = stripQuestionQuotes(matches[matches.length - 1] ?? '')
  if (last === '' || last.length > 120) return null
  return last
}

function fixEnding(text: string, lang: 'ko' | 'en'): string {
  if (endsOnDialogue(text, lang)) return text
  const trimmed = text.trimEnd()
  const question = lastQuestion(trimmed)
  const fallback = lang === 'ko' ? '…이제 어떻게 할 거야?' : '…What now?'
  // Use straight quotes for the appended line so both languages share the dialogue check.
  const dialogue = `"${question ?? fallback}"`
  return `${trimmed}\n\n${dialogue}`
}
