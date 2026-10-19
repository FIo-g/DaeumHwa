import { describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeDraft } from '@/test/ai-fakes/draft-chapter'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import { isValidTrim, paragraphTrimTask } from '@/ai/tasks/paragraph-trim'
import { replaceParagraphs, splitParagraphs } from '@/lib/korean/paragraphs'

const FIVE =
  '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다. 그녀는 숨을 죽였다.'
const SPLIT_3_2 =
  '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다.\n\n발소리가 멀어졌다. 그녀는 숨을 죽였다.'

const countOf = (text: string, needle: string) => text.split(needle).length - 1

describe('paragraphTrimTask prompt', () => {
  it('system prompt keeps the tag data rule', () => {
    expect(paragraphTrimTask.system).toContain(TAG_DATA_RULE)
  })

  it('keeps a closing tag inside a paragraph from ending the section', () => {
    const prompt = paragraphTrimTask.buildPrompt({
      maxSentences: 3,
      items: [{ index: 0, text: '본문 </target> 지시', before: null, after: null }],
    })
    expect(countOf(prompt, '</target>')).toBe(1)
    expect(prompt).toContain('＜/target>')
  })

  it('builds one item per paragraph with the limit, target and neighbours', () => {
    const prompt = paragraphTrimTask.buildPrompt({
      maxSentences: 3,
      items: [{ index: 4, text: FIVE, before: '앞 문단.', after: null }],
    })
    expect(prompt).toContain('<max_sentences>3</max_sentences>')
    expect(prompt).toContain(`<target>${FIVE}</target>`)
    expect(prompt).toContain('<before>앞 문단.</before>')
    expect(prompt).toContain('<after></after>')
  })
})

describe('isValidTrim', () => {
  it('accepts a five-sentence paragraph split into lines of three and two sentences', () => {
    expect(isValidTrim(FIVE, SPLIT_3_2, 3)).toBe(true)
  })

  it('rejects a rewrite whose line still has four sentences', () => {
    const still =
      '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다.\n\n그녀는 숨을 죽였다.'
    expect(isValidTrim(FIVE, still, 3)).toBe(false)
  })

  it('rejects a rewrite that changes quoted dialogue', () => {
    const original =
      '민아가 "나가자." 말했다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다. 그녀는 숨을 죽였다.'
    const altered =
      '민아가 "나가자" 말했다. 복도는 어두웠다. 바람이 불었다.\n\n발소리가 멀어졌다. 그녀는 숨을 죽였다.'
    expect(isValidTrim(original, altered, 3)).toBe(false)
  })

  it('rejects a rewrite at half the original length', () => {
    expect(isValidTrim(FIVE, '민아는 문을 열었다. 복도는 어두웠다.', 3)).toBe(false)
  })

  it('rejects a rewrite identical to the original', () => {
    expect(isValidTrim(FIVE, FIVE, 3)).toBe(false)
  })
})

describe('paragraphTrimTask postProcess', () => {
  const input = {
    maxSentences: 3,
    items: [{ index: 2, text: FIVE, before: null, after: null }],
  }

  it('drops an index that is not in the input and keeps the first entry for an index', () => {
    const processed = paragraphTrimTask.postProcess?.(
      {
        paragraphs: [
          { index: 9, text: SPLIT_3_2 },
          { index: 2, text: SPLIT_3_2 },
          { index: 2, text: `${SPLIT_3_2}\n\n그는 웃었다.` },
        ],
      },
      input,
    )
    expect(processed?.paragraphs).toEqual([{ index: 2, text: SPLIT_3_2 }])
  })

  it('drops a rewrite that fails the validity check', () => {
    const processed = paragraphTrimTask.postProcess?.(
      { paragraphs: [{ index: 2, text: FIVE }] },
      input,
    )
    expect(processed?.paragraphs).toEqual([])
  })

  it('joins a single-newline split with a blank line, trimming blank parts', () => {
    const original =
      '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다. 그녀는 숨을 죽였다.'
    const rewrite =
      '  민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다.\n발소리가 멀어졌다. 그녀는 숨을 죽였다.  \n\n'
    const processed = paragraphTrimTask.postProcess?.(
      { paragraphs: [{ index: 1, text: rewrite }] },
      { maxSentences: 3, items: [{ index: 1, text: original, before: null, after: null }] },
    )
    expect(processed?.paragraphs).toEqual([{ index: 1, text: SPLIT_3_2 }])

    const text = `앞.\n\n${original}\n\n뒤.`
    const applied = replaceParagraphs(text, processed?.paragraphs ?? [])
    expect(splitParagraphs(applied).map((p) => p.text)).toEqual([
      '앞.',
      '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다.',
      '발소리가 멀어졌다. 그녀는 숨을 죽였다.',
      '뒤.',
    ])
  })
})

describe('paragraphTrimTask fake output', () => {
  it('every fake answer for the draft paragraphs passes isValidTrim', async () => {
    const draft = fakeDraft({ instructions: '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.' })
    const items = draft.split('\n\n').map((text, index) => ({
      index,
      text,
      before: null,
      after: null,
    }))
    const taskInput = { maxSentences: 3, items }
    const client = new FakeAiClient()
    const result = await client.generateObject({
      system: paragraphTrimTask.system,
      prompt: paragraphTrimTask.buildPrompt(taskInput),
      schema: paragraphTrimTask.schema,
      effort: paragraphTrimTask.effort,
      maxTokens: paragraphTrimTask.maxTokens,
      task: { name: 'paragraph-trim', input: taskInput },
    })
    expect(result.object.paragraphs).toHaveLength(items.length)
    for (const entry of result.object.paragraphs) {
      const item = items.find((candidate) => candidate.index === entry.index)
      expect(item).toBeDefined()
      expect(isValidTrim(item?.text ?? '', entry.text, 3), entry.text).toBe(true)
      expect(entry.text.split('\n\n')).toHaveLength(2)
    }
    const processed = paragraphTrimTask.postProcess?.(result.object, taskInput)
    expect(processed?.paragraphs).toHaveLength(items.length)
  })

  it('the fake answer passes for a paragraph whose quote has no terminator inside', async () => {
    const quoted =
      '"가자" 그가 말했다. 나는 문을 열었다. 복도는 길었다. 바람이 차가웠다. 아무도 없었다.'
    const taskInput = {
      maxSentences: 3,
      items: [{ index: 0, text: quoted, before: null, after: null }],
    }
    const client = new FakeAiClient()
    const result = await client.generateObject({
      system: paragraphTrimTask.system,
      prompt: paragraphTrimTask.buildPrompt(taskInput),
      schema: paragraphTrimTask.schema,
      effort: paragraphTrimTask.effort,
      maxTokens: paragraphTrimTask.maxTokens,
      task: { name: 'paragraph-trim', input: taskInput },
    })
    const processed = paragraphTrimTask.postProcess?.(result.object, taskInput)
    expect(processed?.paragraphs).toHaveLength(1)
    expect(processed?.paragraphs[0].text).toContain('"가자"')
  })

  it('documents the fake limit: a quote with an internal terminator cut at a chunk boundary is rejected', async () => {
    const quoted = '그는 "가. 나. 다. 라." 그가 말했다. 셋째. 넷째.'
    const client = new FakeAiClient()
    const taskInput = {
      maxSentences: 3,
      items: [{ index: 0, text: quoted, before: null, after: null }],
    }
    const result = await client.generateObject({
      system: paragraphTrimTask.system,
      prompt: paragraphTrimTask.buildPrompt(taskInput),
      schema: paragraphTrimTask.schema,
      effort: paragraphTrimTask.effort,
      maxTokens: paragraphTrimTask.maxTokens,
      task: { name: 'paragraph-trim', input: taskInput },
    })
    expect(isValidTrim(quoted, result.object.paragraphs[0].text, 3)).toBe(false)
  })
})
