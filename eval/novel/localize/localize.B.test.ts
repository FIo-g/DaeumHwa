import { afterEach, describe, expect, it, vi } from 'vitest'
import { EN_SYSTEMS } from './en-systems'
import {
  buildEnInterviewExtractSystem,
  EN_SPEECH_EXTRACT_APPEND,
  EN_SPEECH_EXTRACT_RULE,
  INTERVIEW_EXTRACT_SYSTEM,
} from './en/interview-extract'
import {
  buildEnInterviewQuestionSystem,
  EN_SPEECH_QUESTION_RULE,
  INTERVIEW_QUESTION_SYSTEM,
} from './en/interview-question'
import { findHangul, translateScaffold } from './scaffold'

afterEach(() => {
  vi.unstubAllEnvs()
})

// Brief B: English mirrors of the speech feature (off by default, off in the eval). The English
// text must carry no Hangul, and the flag-off English prompts stay as they were.

describe('speech feature: English scaffold', () => {
  it('translates the no-speech marker of a character card without Hangul left', () => {
    const translated = translateScaffold('- (인물, 사실 0개, 말투 없음): x')
    expect(findHangul(translated)).toEqual([])
    expect(translated).toContain('no speech style')
  })

  it('translates the per-character speech note without Hangul left', () => {
    const translated = translateScaffold('인물별 말투. 대사는 이 말투를 따르고 바꾸지 않는다.')
    expect(findHangul(translated)).toEqual([])
    expect(translated).toBe('Speech style per character. Dialogue follows it and never changes it.')
  })
})

describe('speech feature: English systems', () => {
  it('keeps the question system unchanged when off', () => {
    expect(buildEnInterviewQuestionSystem(false)).toBe(INTERVIEW_QUESTION_SYSTEM)
    expect(INTERVIEW_QUESTION_SYSTEM).not.toContain('speech')
  })

  it('inserts the speech question rule after the core settings line when on', () => {
    const system = buildEnInterviewQuestionSystem(true)
    expect(system).toContain('no speech style')
    expect(findHangul(system)).toEqual([])
    const lines = system.split('\n')
    const core = lines.findIndex((line) => line.startsWith('- The core setting topics are'))
    expect(lines[core + 1]).toBe(EN_SPEECH_QUESTION_RULE)
    expect(lines.filter((line) => line === EN_SPEECH_QUESTION_RULE)).toHaveLength(1)
  })

  it('keeps the extraction system unchanged when off', () => {
    expect(buildEnInterviewExtractSystem(false)).toBe(INTERVIEW_EXTRACT_SYSTEM)
    expect(INTERVIEW_EXTRACT_SYSTEM).not.toContain('key "speech"')
  })

  it('appends the speech sentence and adds the speech key rule when on', () => {
    const system = buildEnInterviewExtractSystem(true)
    expect(system).toContain(EN_SPEECH_EXTRACT_APPEND.trim())
    expect(system).toContain(EN_SPEECH_EXTRACT_RULE)
    expect(findHangul(system)).toEqual([])
    const lines = system.split('\n')
    const rule = lines.indexOf(EN_SPEECH_EXTRACT_RULE)
    expect(lines[rule + 1]).toContain('- A name (name) uses only the proper name.')
  })

  it('English speech rules carry no Hangul', () => {
    expect(findHangul(EN_SPEECH_QUESTION_RULE)).toEqual([])
    expect(findHangul(EN_SPEECH_EXTRACT_APPEND)).toEqual([])
    expect(findHangul(EN_SPEECH_EXTRACT_RULE)).toEqual([])
  })
})

describe('speech feature: EN_SYSTEMS assembler (test 27)', () => {
  it('carries no speech rule when the flag is off', () => {
    vi.stubEnv('AI_SPEECH_STYLE', 'off')
    expect(EN_SYSTEMS['interview-question']).toBe(INTERVIEW_QUESTION_SYSTEM)
    expect(EN_SYSTEMS['interview-extract']).toBe(INTERVIEW_EXTRACT_SYSTEM)
    expect(EN_SYSTEMS['interview-question']).not.toContain('no speech style')
  })

  it('adds the English speech rules when the flag is on, read per access', () => {
    vi.stubEnv('AI_SPEECH_STYLE', 'on')
    expect(EN_SYSTEMS['interview-question']).toBe(buildEnInterviewQuestionSystem(true))
    expect(EN_SYSTEMS['interview-question']).toContain('no speech style')
    expect(EN_SYSTEMS['interview-extract']).toBe(buildEnInterviewExtractSystem(true))
    expect(EN_SYSTEMS['interview-extract']).toContain(EN_SPEECH_EXTRACT_RULE)
    expect(findHangul(EN_SYSTEMS['interview-question'])).toEqual([])
    expect(findHangul(EN_SYSTEMS['interview-extract'])).toEqual([])
    vi.stubEnv('AI_SPEECH_STYLE', 'off')
    expect(EN_SYSTEMS['interview-question']).not.toContain('no speech style')
  })
})
