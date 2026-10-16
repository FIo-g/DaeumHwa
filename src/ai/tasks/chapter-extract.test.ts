import { describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/ai/fake'
import { ExtractionSchema } from '@/ai/extraction'
import { type ChapterExtractInput, chapterExtractTask } from '@/ai/tasks/chapter-extract'

const base: ChapterExtractInput = {
  chapterText: '서윤은 검을 쥐었다. 레이아가 웃었다. 서윤은 말이 없었다. 바람이 불었다.',
  chapterPosition: 3,
  chapterTitle: '3화',
  known: [{ name: '서윤', kind: 'character', aliases: [] }],
  openThreads: [],
  knownFacts: [],
}

describe('chapterExtractTask', () => {
  it('has the exact Korean system prompt opening and rules', () => {
    expect(
      chapterExtractTask.system.startsWith('당신은 장기 연재 웹소설의 설정 기록 담당자다.'),
    ).toBe(true)
    expect(chapterExtractTask.system).toContain('원고에 실제로 쓰인 내용만 뽑는다.')
    expect(chapterExtractTask.system).toContain('모든 출력은 한국어로 쓴다.')
  })

  it('builds the known, known_facts, open_threads and manuscript blocks', () => {
    const prompt = chapterExtractTask.buildPrompt({
      ...base,
      openThreads: [{ ref: 'T1', title: '검의 정체', description: '누가 검을 두었나' }],
      knownFacts: [{ ref: 'F1', subjectName: '서윤', content: '서윤은 왼손잡이다.' }],
    })
    expect(prompt).toContain('<known>')
    expect(prompt).toContain('<known_facts>')
    expect(prompt).toContain('[F1] 서윤: 서윤은 왼손잡이다.')
    expect(prompt).toContain('<open_threads>')
    expect(prompt).toContain('[T1] 검의 정체')
    expect(prompt).toContain('<manuscript position="3" title="3화">')
  })

  it('fake output validates with the extraction schema and summarizes the first sentence', () => {
    const output = ExtractionSchema.parse(chapterExtractTask.fake(base))
    expect(output.summary).toBe('서윤은 검을 쥐었다.')
  })

  it('fake adds a new character for a frequent subject word that is not known', () => {
    const text = '레이아는 웃었다. 레이아는 달렸다. 레이아는 멈췄다. 서윤은 왔다.'
    const output = chapterExtractTask.fake({ ...base, chapterText: text })
    const names = output.entries.map((e) => e.name)
    expect(names).toEqual(['레이아'])
    expect(output.entries[0]).toMatchObject({ kind: 'character', aliases: [], summary: '' })
  })

  it('fake records one appearance fact per mentioned known or new entry', () => {
    const text = '레이아는 웃었다. 레이아는 달렸다. 레이아는 멈췄다. 서윤은 왔다.'
    const output = chapterExtractTask.fake({ ...base, chapterText: text })
    const subjects = output.facts.map((f) => f.subjectName).sort()
    expect(subjects).toEqual(['레이아', '서윤'])
    const seoyun = output.facts.find((f) => f.subjectName === '서윤')
    expect(seoyun).toMatchObject({
      content: '3화에 등장한다.',
      suggestedStatus: 'confirmed',
      supersedesFactRef: null,
      evidence: '서윤은 왔다.',
    })
  })

  it('fake returns no threads or relations', () => {
    const output = chapterExtractTask.fake(base)
    expect(output.threads).toEqual([])
    expect(output.relations).toEqual([])
  })

  it('fake output is accepted by the real provider path (FakeAiClient parses it)', async () => {
    const client = new FakeAiClient()
    const result = await client.generateObject({
      system: chapterExtractTask.system,
      prompt: chapterExtractTask.buildPrompt(base),
      schema: chapterExtractTask.schema,
      effort: chapterExtractTask.effort,
      maxTokens: chapterExtractTask.maxTokens,
      fake: () => chapterExtractTask.fake(base),
    })
    expect(result.object.summary).toBe('서윤은 검을 쥐었다.')
  })
})
