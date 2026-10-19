import { describe, expect, it } from 'vitest'
import { repeatedWords } from './repeats'

const pick = (words: { word: string; count: number }[]) =>
  words.map(({ word, count }) => ({ word, count }))

describe('repeatedWords', () => {
  const handText = '오른손으로 잡고 오른손을 뻗었다 오른손'

  it('strips particles so 오른손으로 and 오른손을 count as one word', () => {
    const result = repeatedWords(handText, { minCount: 3 })
    expect(pick(result)).toEqual([{ word: '오른손', count: 3 }])
    expect(result[0].positions).toHaveLength(3)
  })

  it('uses the default minCount of 8', () => {
    expect(repeatedWords(handText)).toEqual([])
  })

  it('reports one hit at the default minCount of 8', () => {
    expect(pick(repeatedWords('오른손을 '.repeat(8)))).toEqual([{ word: '오른손', count: 8 }])
    expect(repeatedWords('오른손을 '.repeat(7))).toEqual([])
  })

  it('counts bigrams of adjacent words', () => {
    const text = 'He did not go. She did not stop. We did not care.'
    expect(pick(repeatedWords(text, { lang: 'en', ngram: 2, minCount: 3 }))).toEqual([
      { word: 'did not', count: 3 },
    ])
  })

  it('ignores English stop words and short words', () => {
    expect(repeatedWords('the the the the the the cat', { lang: 'en', minCount: 3 })).toEqual([])
  })

  it('drops allowed words', () => {
    expect(repeatedWords(handText, { minCount: 3, allow: ['오른손'] })).toEqual([])
  })

  it('pairs adjacent tokens before filtering, so a stop word sits inside a bigram', () => {
    const text = 'did not go. did not stop. did not care. did not'
    const result = repeatedWords(text, { lang: 'en', ngram: 2, minCount: 4 })
    expect(pick(result)).toEqual([{ word: 'did not', count: 4 }])
    expect(result.some((hit) => hit.word === 'not go')).toBe(false)

    const fox = repeatedWords('red the fox. red the fox. red the fox.', {
      lang: 'en',
      ngram: 2,
      minCount: 3,
    })
    expect(fox.map((hit) => hit.word)).toEqual(expect.arrayContaining(['red the', 'the fox']))
  })

  it('computes per1000 over code points', () => {
    const text = 'abcdefgh abcdefgh abcdefgh' + '.'.repeat(34)
    expect([...text]).toHaveLength(60)
    const result = repeatedWords(text, { lang: 'en', minCount: 3 })
    expect(result).toHaveLength(1)
    expect(result[0].per1000).toBe(50)
  })
})
