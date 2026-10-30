import { describe, expect, it } from 'vitest'
import {
  extractNameCandidates,
  findUngroundedNames,
  groundingTexts,
  MAX_UNKNOWN_NAMES,
} from '@/lib/interview-names'

// P12: names in an interview question that the work never gave.

const texts = (question: string) =>
  extractNameCandidates(question).map((c) => `${c.kind}:${c.text}`)

describe('extractNameCandidates', () => {
  it('reads capitalized names in the middle of a sentence', () => {
    expect(texts('Why does Serin trust Do Yunseo at the Ashen Bell Tower?')).toEqual([
      'latin:Serin',
      'latin:Do Yunseo',
      'latin:Ashen Bell Tower',
    ])
  })

  it('skips a lone capital that opens a sentence', () => {
    expect(texts('What is Serin afraid of? Serin hides it.')).toEqual(['latin:Serin'])
  })

  it('drops only the first word of a sentence-opening name', () => {
    expect(texts('Do Yunseo hands her the key.')).toEqual(['latin:Yunseo'])
  })

  it('removes possessive endings', () => {
    expect(
      texts("Why does Gwak Duseok’s soup house open late, and does Serin's mother know?"),
    ).toEqual(['latin:Gwak Duseok', 'latin:Serin'])
  })

  it('ignores Chapter and Korean', () => {
    expect(texts('What happens in Chapter 7 when Korean readers see it?')).toEqual([])
  })

  it('reads a short quoted Korean term followed by a particle', () => {
    expect(texts("백지원이 말한 '은화 빚'은 누구에게 진 빚인가요?")).toEqual(['quoted:은화 빚'])
  })

  it('reads corner, double and curly quotes in reading order', () => {
    expect(texts('《잿빛 종루의 열쇠》와 「열쇠」, “소문”, ‘안개’를 말해 주세요.')).toEqual([
      'quoted:잿빛 종루의 열쇠',
      'quoted:열쇠',
      'quoted:소문',
      'quoted:안개',
    ])
  })

  it('ignores quotes that are too long, too short or a sentence', () => {
    expect(texts("'이 세계에는 일상 밖의 규칙이 있다'와 '가'와 '정말요?'")).toEqual([])
  })

  it('does not read English apostrophes as quotes', () => {
    expect(texts("Does Serin's mother's letter mention the king's key?")).toEqual(['latin:Serin'])
  })

  it('reads English quoted phrases', () => {
    expect(texts("Is 'silver debt' the same as the 'young miss' habit?")).toEqual([
      'quoted:silver debt',
      'quoted:young miss',
    ])
  })

  it('treats a capital right after an opening quote as a sentence start', () => {
    expect(texts("Is the phrase 'The rule of the bell' known?")).toEqual([])
  })

  it('finds nothing in a plain Korean question', () => {
    expect(texts('주인공은 누구이고 무엇을 가장 원하나요?')).toEqual([])
  })
})

describe('findUngroundedNames', () => {
  const question = 'Why does Gwak Duseok’s soup house open late?'

  it('accepts names found in the grounding, ignoring case and a possessive', () => {
    expect(findUngroundedNames(question, ['Owner: gwak duseok, soup house'])).toEqual([])
  })

  it('reports a name when one of its words is missing', () => {
    expect(findUngroundedNames(question, ['Duseok runs a soup house'])).toEqual(['Gwak Duseok'])
  })

  it('matches whole words only', () => {
    expect(findUngroundedNames('Why does Ash open the gate?', ['Ashen Bell Tower'])).toEqual([
      'Ash',
    ])
  })

  it('matches quoted terms ignoring spaces and punctuation', () => {
    const q = "백지원이 말한 '은화 빚'은 누구에게 진 빚인가요?"
    expect(findUngroundedNames(q, ['백지원의 은화 빚 떡밥'])).toEqual([])
    expect(findUngroundedNames(q, ['백지원'])).toEqual(['은화 빚'])
  })

  it('caps the list and drops duplicates', () => {
    expect(MAX_UNKNOWN_NAMES).toBe(5)
    expect(
      findUngroundedNames(
        'Why do Alpha, Bravo, Charlie, Delta, Echo and Foxtrot meet Alpha again?',
        [],
      ),
    ).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
  })

  it('returns nothing for a question without candidates', () => {
    expect(findUngroundedNames('주인공은 누구인가요?', [])).toEqual([])
  })

  it('flags every candidate against empty grounding', () => {
    expect(findUngroundedNames('Why does Serin meet Mina?', [])).toEqual(['Serin', 'Mina'])
  })
})

describe('groundingTexts', () => {
  it("lists the author's text in a fixed order", () => {
    const source = {
      work: { title: 'T', genre: 'G', logline: 'L', synopsis: 'S' },
      wiki: {
        entries: [{ name: '한세린', summary: '소녀' }],
        openThreads: [{ title: '편지' }],
      },
      story: {
        recentSummaries: [{ title: '1화', summary: '요약' }],
        readerReactions: [{ digest: '반응' }],
      },
    }
    expect(groundingTexts(source, ['답1'])).toEqual([
      'T',
      'G',
      'L',
      'S',
      '한세린',
      '소녀',
      '편지',
      '1화',
      '요약',
      '반응',
      '답1',
    ])
  })
})

describe('P12 whole-word names with non-ASCII letters or inner capitals', () => {
  it('keeps an accented name whole when the wiki has it', () => {
    expect(findUngroundedNames('Why does Chloé fear the sea?', ['Chloé is a sailor.'])).toEqual([])
  })

  it('keeps an inner-capital name whole when the wiki has it', () => {
    expect(
      findUngroundedNames('Why does McAllister hide the key?', ['McAllister keeps the key.']),
    ).toEqual([])
  })

  it('keeps a name with a diacritic in the first letter whole', () => {
    expect(findUngroundedNames('Why does Björn sail at night?', ['Björn is a sailor.'])).toEqual([])
  })

  it('reads a Korean question with a Latin accented name as grounded', () => {
    expect(findUngroundedNames('클로에가 왜 Chloé라고 불리나요?', ['Chloé'])).toEqual([])
  })

  it('reports an ungrounded accented name whole, not a fragment', () => {
    expect(findUngroundedNames('Why does Chloé fear the sea?', ['Serin is a sailor.'])).toEqual([
      'Chloé',
    ])
  })

  it('still reads plain Latin names as before', () => {
    expect(
      findUngroundedNames('Why does Serin trust Do Yunseo at the Ashen Bell Tower?', [
        'Serin lives here.',
      ]),
    ).toEqual(['Do Yunseo', 'Ashen Bell Tower'])
  })
})
