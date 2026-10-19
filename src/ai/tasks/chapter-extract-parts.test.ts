import { describe, expect, it } from 'vitest'
import { type ChapterExtractInput, chapterExtractTask } from '@/ai/tasks/chapter-extract'

export const SAMPLE_INPUT: ChapterExtractInput = {
  chapterText: '서윤은 검을 쥐었다. 레이아가 웃었다. 서윤은 말이 없었다.',
  chapterPosition: 3,
  chapterTitle: '3화',
  known: [
    { name: '서윤', kind: 'character', aliases: ['윤'] },
    { name: '한시우', kind: 'character', aliases: [], pending: true },
  ],
  openThreads: [
    { ref: 'T1', title: '검의 정체', description: '누가 검을 두었나', status: 'planted' },
    { ref: 'T2', title: '사라진 동생', description: '', status: 'planned' },
  ],
  knownFacts: [{ ref: 'F1', subjectName: '서윤', content: '왼손잡이다' }],
}

// Full prompt of chapterExtractTask for SAMPLE_INPUT, captured before the block refactor.
const SAMPLE_PROMPT = "<known>\n- 서윤 (인물, 별칭: 윤)\n- 한시우 (인물, 승인 대기)\n</known>\n\n<known_facts>\n[F1] 서윤: 왼손잡이다\n</known_facts>\n\n<open_threads>\n[T1] 검의 정체: 누가 검을 두었나\n[T2] (계획됨) 사라진 동생\n</open_threads>\n\n<manuscript position=\"3\" title=\"3화\">\n서윤은 검을 쥐었다. 레이아가 웃었다. 서윤은 말이 없었다.\n</manuscript>"

describe('chapterExtractTask.buildPrompt', () => {
  it('chapterExtractTask.buildPrompt is unchanged', () => {
    expect(chapterExtractTask.buildPrompt(SAMPLE_INPUT)).toBe(SAMPLE_PROMPT)
  })
})
