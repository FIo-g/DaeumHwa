// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DirectiveFinding } from '@/lib/directive-check'
import type { DirectiveForPrompt } from '@/lib/directives'
import { DirectiveFindingsView } from './draft-panel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/ai-features', () => ({
  createChapterFromDraftAction: vi.fn(),
  draftFindingsAction: vi.fn(),
  planDraftAction: vi.fn(),
  recordDraftUseAction: vi.fn(),
}))

// Stage 2 (task 5): the draft panel lists where a draft breaks a checkable request.

afterEach(cleanup)

const directives: DirectiveForPrompt[] = [
  {
    id: 'ban',
    scope: 'work',
    kind: 'ban',
    text: '입꼬리를 쓰지 않는다.',
    pattern: '입꼬리',
    speechLevel: null,
    targetChars: null,
    chapterPosition: null,
    entryId: null,
    entryName: null,
  },
  {
    id: 'sp',
    scope: 'character',
    kind: 'speech',
    text: '민준은 존댓말을 쓴다.',
    pattern: null,
    speechLevel: 'jondaet',
    targetChars: null,
    chapterPosition: null,
    entryId: 'm',
    entryName: '민준',
  },
  {
    id: 'len',
    scope: 'work',
    kind: 'length',
    text: '분량을 맞춘다.',
    pattern: null,
    speechLevel: null,
    targetChars: 5000,
    chapterPosition: null,
    entryId: null,
    entryName: null,
  },
]

const findings: DirectiveFinding[] = [
  { directiveId: 'ban', kind: 'ban', count: 2, paragraphs: [0, 1] },
  { directiveId: 'sp', kind: 'speech', count: 1, paragraphs: [3] },
  { directiveId: 'len', kind: 'length', count: 1, paragraphs: [] },
]

describe('DirectiveFindingsView', () => {
  it('renders the title and one line per finding kind', () => {
    render(<DirectiveFindingsView findings={findings} directives={directives} />)
    expect(screen.getByText('요청과 다른 곳')).toBeTruthy()
    expect(screen.getByText("'입꼬리' 2곳")).toBeTruthy()
    expect(screen.getByText('민준의 말투가 요청과 다른 대사 1곳')).toBeTruthy()
    expect(screen.getByText('분량이 요청한 5000자와 다릅니다')).toBeTruthy()
  })

  it('renders nothing without findings', () => {
    const { container } = render(<DirectiveFindingsView findings={[]} directives={directives} />)
    expect(container.textContent).toBe('')
  })
})
