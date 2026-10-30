import { describe, expect, it } from 'vitest'
import { CORE_TOPICS } from '@/ai/tasks/interview-question'
import { isStyleTopic, STYLE_TOPIC, styleCardFromAnswer } from '@/ai/interview-style'

const KO_ANSWER =
  '세린 시점의 3인칭 제한 시점으로 써요. 건조하고 차분하게, 안개와 소리, 차가움 같은 감각으로 분위기를 만들어요. 감정은 직접 말하지 않고 몸짓으로 보여 주고, 문단은 짧게 끊어요.'

const EN_ANSWER =
  "It's written in third-person limited from Serin's point of view. Dry and calm, building mood through senses like fog, sound and cold. Emotions are shown through gestures rather than stated, and paragraphs are kept short."

describe('STYLE_TOPIC and isStyleTopic (P11)', () => {
  it('STYLE_TOPIC is a core topic', () => {
    expect(CORE_TOPICS.map((t) => t.name)).toContain(STYLE_TOPIC)
  })

  it('isStyleTopic accepts the style topic in both languages', () => {
    for (const topic of ['문체', 'style', 'Style', '문체와 시점', 'Writing style']) {
      expect(isStyleTopic(topic)).toBe(true)
    }
  })

  it('isStyleTopic rejects other topics', () => {
    for (const topic of [
      '주인공',
      '주요 인물',
      '주인공의 말투',
      '떡밥',
      'Main characters',
      '다음 전개',
      'Combat style',
      "Serin's fighting style",
      'Speech style',
      'Supporting character speech style',
      'Lifestyle',
      '세린의 말투와 문체',
      '',
    ]) {
      expect(isStyleTopic(topic)).toBe(false)
    }
  })
})

describe('styleCardFromAnswer (P11)', () => {
  it('splits the saved ko answer into tone and rules', () => {
    expect(styleCardFromAnswer('문체', KO_ANSWER)).toEqual({
      entryName: null,
      name: '문체',
      tone: '세린 시점의 3인칭 제한 시점으로 써요.',
      rules:
        '- 건조하고 차분하게, 안개와 소리, 차가움 같은 감각으로 분위기를 만들어요.\n- 감정은 직접 말하지 않고 몸짓으로 보여 주고, 문단은 짧게 끊어요.',
      examples: '',
    })
  })

  it('splits the saved en answer under the Style topic', () => {
    const card = styleCardFromAnswer('Style', EN_ANSWER)
    expect(card).not.toBeNull()
    expect(card?.name).toBe('Style')
    expect(card?.entryName).toBeNull()
    expect(card?.tone).toBe("It's written in third-person limited from Serin's point of view.")
    expect(card?.rules.split('\n')).toHaveLength(2)
    expect(card?.rules.split('\n').every((line) => line.startsWith('- '))).toBe(true)
    expect(card?.examples).toBe('')
  })

  it('keeps a one-sentence answer as the tone with empty rules', () => {
    const card = styleCardFromAnswer('문체', '짧고 건조하게 쓴다.')
    expect(card?.tone).toBe('짧고 건조하게 쓴다.')
    expect(card?.rules).toBe('')
  })

  it('strips list markers and stray numbers', () => {
    const bullets = styleCardFromAnswer('문체', '- 짧게 쓴다\n- 건조하게')
    expect(bullets?.tone).toBe('짧게 쓴다')
    expect(bullets?.rules).toBe('- 건조하게')

    const numbered = styleCardFromAnswer('문체', '1. 짧게 쓴다. 2. 건조하게 쓴다.')
    expect(numbered?.tone).toBe('짧게 쓴다.')
    expect(numbered?.rules).toBe('- 건조하게 쓴다.')
  })

  it('drops an undecided sentence', () => {
    const card = styleCardFromAnswer('문체', '아직 정하지 않았어요. 문장은 짧게 쓰고 싶어요.')
    expect(card?.tone).toBe('문장은 짧게 쓰고 싶어요.')
    expect(card?.rules).toBe('')
  })

  it('returns null when nothing is left', () => {
    expect(styleCardFromAnswer('문체', '미정')).toBeNull()
    expect(styleCardFromAnswer('문체', '아직 정하지 않았어요.')).toBeNull()
    expect(styleCardFromAnswer('문체', '   ')).toBeNull()
  })

  it('names the card from the topic, with a fallback', () => {
    const longTopic = '가'.repeat(60)
    const card = styleCardFromAnswer(longTopic, '짧게 쓴다.')
    expect(Array.from(card?.name ?? '')).toHaveLength(40)
    expect(styleCardFromAnswer('  ', '짧게 쓴다.')?.name).toBe('작품 문체')
  })
})
