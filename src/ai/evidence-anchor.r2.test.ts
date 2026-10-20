import { describe, expect, it } from 'vitest'
import {
  evidenceHasThreadKeyword,
  evidenceNamesSubject,
  subjectForms,
  threadKeywords,
} from '@/ai/evidence-anchor'

// P10 (round 2) pure predicates: does an evidence sentence name the fact's subject, and does it
// share a keyword with the thread. Rows come from the saved 2026-10-18 chapter extractions.

describe('subjectForms', () => {
  it('adds the given name of a person-like card', () => {
    expect(subjectForms(['한세린'], 'character')).toEqual(['한세린', '세린'])
    expect(subjectForms(['남궁민수'], 'character')).toEqual(['남궁민수', '궁민수', '민수'])
    expect(subjectForms(['남궁민수'], 'place')).toEqual(['남궁민수'])
    expect(subjectForms(['한세린'], undefined)).toEqual(['한세린', '세린'])
  })

  it('adds the words of a spaced name', () => {
    expect(subjectForms(['잿빛 종루'], 'place')).toEqual(['잿빛 종루', '잿빛', '종루'])
    expect(subjectForms(['Silver Key'], 'item')).toEqual(['silver key', 'silver', 'key'])
    expect(subjectForms(['Han Serin'], 'character')).toEqual(['han serin', 'serin'])
    expect(subjectForms(['Mother’s Letter'], 'item')).toEqual([
      "mother's letter",
      'mother',
      'letter',
    ])
  })

  it('ignores a name shorter than two characters', () => {
    expect(subjectForms(['A'], 'character')).toEqual([])
  })
})

describe('evidenceNamesSubject on saved-run rows', () => {
  it.each<[string[], 'character' | 'place' | 'item' | undefined, string, boolean]>([
    [['한세린', '세린'], 'character', '세린은 붓을 왼손으로 쥐고 이름을 적었다.', true],
    // Author-rejected subject swap (Haiku ko).
    [['한서연'], 'character', '밀랍 위에는 문양 없이 손톱으로 누른 자국만 남아 있었다.', false],
    // Author-rejected scope error (Haiku ko).
    [['은색 열쇠'], 'item', '오늘은 보름이 아니잖아요.', false],
    [['은색 열쇠'], 'item', '열쇠가 셔츠 아래로 내려가 쇄골에 닿았다.', true],
    [['한세린'], 'character', '열쇠가 셔츠 아래로 내려가 쇄골에 닿았다.', false],
    [['잿빛 종루'], 'place', "아무도 그 이름을 '종루'라고 부르지 않았다.", true],
    [['잿빛 종루'], 'place', '구층 꼭대기에 닿자 안개가 한 겹 벗겨졌다.', false],
    [['백지원', '감시관'], 'character', '감시관은 말이 없었다.', true],
    [['백지원'], 'character', '감시관은 말이 없었다.', false],
    [['남궁민수'], 'character', '민수는 웃었다.', true],
    [['남궁민수'], 'place', '민수는 웃었다.', false],
    [
      ['Silver Key'],
      'item',
      'Beneath the letter, looped over two of his fingers, hung a silver key on a thin cord.',
      true,
    ],
    [
      ['Silver Key'],
      'item',
      'It will only enter its lock on a night when the moon is full.',
      false,
    ],
    [['Silver Key'], 'item', 'The monkey ran away.', false],
    [['Baek Jiwon', 'the warden'], 'character', 'Baek Jiwon. The warden.', true],
    [['Baek Jiwon'], 'character', "Go home, Han Serin. Don't come back up here.", false],
    [['Han Serin'], 'character', 'Han Seoyeon climbed those stairs too.', false],
    [['Han Serin'], 'character', 'She had never gone past the second landing.', false],
    [['Mother’s Letter'], 'item', 'THE LETTER WAS CLOSED.', true],
    [
      ['Ashen Bell Tower'],
      'place',
      'Then the fog shivered, and far above it the bell trembled.',
      true,
    ],
    [['Ashen Bell Tower'], 'place', '"The upper floors are closed," he said.', false],
    [['A'], 'character', 'anything', true],
  ])('names=%j kind=%s evidence=%j -> %s', (names, kind, evidence, expected) => {
    expect(evidenceNamesSubject(evidence, names, kind)).toBe(expected)
  })
})

describe('threadKeywords', () => {
  it('splits Korean words and strips particles', () => {
    expect(threadKeywords('어머니의 편지 봉인')).toEqual(['어머니', '편지', '봉인'])
  })

  it('keeps English words of three letters or more, without stop words', () => {
    expect(threadKeywords("The seal on Mother's Letter")).toEqual(['seal', 'mother', 'letter'])
  })

  it('drops stop words in both languages', () => {
    expect(threadKeywords('아직 드러나지 않았다')).toEqual([])
    expect(threadKeywords('the and for')).toEqual([])
  })
})

describe('evidenceHasThreadKeyword on saved-run rows', () => {
  it.each<[string, string, string, boolean]>([
    // Matched by 혼자 from the description only (the title word 종 is one character).
    [
      '저절로 떨리는 종',
      '줄을 당긴 사람도 없이 종이 혼자 떨며 쇳소리를 낸다.',
      '종은 울리지 않은 채, 저 혼자 떨고 있었다.',
      true,
    ],
    [
      '어머니의 편지 봉인',
      '한서연이 남긴 편지는 봉인이 뜯기지 않은 상태이며, 내용은 아직 드러나지 않았다.',
      '뜯긴 자국은 없었다.',
      false,
    ],
    [
      '보름에 맞는 자물쇠',
      '은색 열쇠가 보름에만 들어가는 자물쇠가 어디에 있는지 아직 드러나지 않았다.',
      '그래서 오늘은 쓸 수 없습니다.',
      false,
    ],
    // Known blind spot: the author rejected this thread, and the check cannot see why. The
    // title word 다른 is in the evidence, so it passes.
    [
      '도윤서의 다른 길',
      '도윤서는 세린과 헤어져 다른 길로 떠났다. 그의 목적은 아직 드러나지 않았다.',
      '저는 다른 길로 갑니다.',
      true,
    ],
    [
      'The seal on Mother’s Letter',
      'The sealed letter from Han Seoyeon is still unopened, and Serin has not broken its seal.',
      'She did not break it.',
      false,
    ],
    [
      'Who touched the bell',
      'The bell trembled and did not ring, and Serin was certain no one else was at the top of the tower.',
      'So who had touched the bell?',
      true,
    ],
    ['the and for', '', 'anything', true],
  ])('title=%j evidence=%j -> %s', (title, description, evidence, expected) => {
    expect(evidenceHasThreadKeyword(evidence, [title, description])).toBe(expected)
  })
})
