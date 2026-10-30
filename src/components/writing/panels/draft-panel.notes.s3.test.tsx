// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterRow, Role } from '@/db/types'
import type { DraftPlanCard } from '@/lib/draft-plan'
import { planDraftAction } from '@/server/actions/ai-features'
import type { WorkspaceApi, WritingData } from '../types'
import { DraftPanel } from './draft-panel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/ai-features', () => ({
  createChapterFromDraftAction: vi.fn(),
  recordDraftUseAction: vi.fn(),
  draftFindingsAction: vi.fn(async () => ({ ok: true, data: { findings: [], directives: [] } })),
  planDraftAction: vi.fn(),
}))

const encoder = new TextEncoder()
const REVISION_PLACEHOLDER = '계획을 한 줄로 고쳐 주세요 (예: 2장면에서 윤서가 먼저 말을 걸게)'

function makeData(): WritingData {
  return {
    workId: 'work-1',
    workTitle: '테스트 작품',
    role: 'editor' as Role,
    targetChars: 2500,
    chapter: {
      id: 'c1',
      workId: 'work-1',
      position: 1,
      title: '1화',
      body: '',
      status: 'draft',
      version: 1,
      archivedAt: null,
    } as unknown as ChapterRow,
    chapters: [{ id: 'c1', position: 1, title: '1화' }],
    entries: [],
    namingRules: [],
    threads: [],
    issues: [],
    comments: [],
    pendingProposalCount: 0,
  }
}

function makeApi(): WorkspaceApi {
  return {
    getText: vi.fn(() => ''),
    replaceRange: vi.fn(),
    replaceQuote: vi.fn(() => false),
    appendText: vi.fn(),
    setHighlights: vi.fn(),
    focusRange: vi.fn(),
    getSelection: vi.fn(() => null),
    saveNow: vi.fn(async () => {}),
    refresh: vi.fn(),
  }
}

function makeCard(): DraftPlanCard {
  return {
    scenes: [
      {
        summary: '성문 앞에 선다.',
        goal: '안으로 들어간다',
        decision: '',
        stake: '',
        trigger: '',
        role: 'opening',
        place: '성문',
        characters: [],
        targetChars: 1250,
      },
      {
        summary: '경비와 맞선다.',
        goal: '통과한다',
        decision: '',
        stake: '',
        trigger: '',
        role: 'ending',
        place: '',
        characters: [],
        targetChars: 1250,
      },
    ],
    ending: { device: 'crisis', line: '문이 열린다.' },
    threads: [],
  }
}

function draftResponse(text: string): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text))
        controller.close()
      },
    }),
    { headers: { 'X-Run-Id': 'run-1' } },
  )
}

function lastFetchBody(): Record<string, unknown> {
  const calls = vi.mocked(fetch).mock.calls
  const [, init] = calls[calls.length - 1]
  return JSON.parse(String((init as RequestInit).body))
}

function planCalls(): unknown[] {
  return vi.mocked(planDraftAction).mock.calls.map((args) => args[0])
}

async function reviseWith(note: string) {
  fireEvent.change(screen.getByPlaceholderText(REVISION_PLACEHOLDER), {
    target: { value: note },
  })
  fireEvent.click(screen.getByRole('button', { name: '다시 계획' }))
  await waitFor(() => expect(planDraftAction).toHaveBeenCalled())
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('DraftPanel revision notes (stage 3 task 7)', () => {
  it('sends the first two notes as earlierNotes on the third revision', async () => {
    vi.mocked(planDraftAction).mockImplementation(async (input: unknown) => {
      const data = input as { revision?: { note: string } }
      const next = makeCard()
      if (data.revision) next.scenes[0] = { ...next.scenes[0]!, summary: data.revision.note }
      return {
        ok: true,
        data: { runId: `plan-${String(planCalls().length + 1)}`, card: next, warnings: [] },
      } as never
    })
    render(<DraftPanel data={makeData()} api={makeApi()} />)

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')

    await reviseWith('열쇠를 목에 건다')
    await screen.findByDisplayValue('열쇠를 목에 건다')
    await reviseWith('밤에 비가 온다')
    await screen.findByDisplayValue('밤에 비가 온다')

    vi.mocked(planDraftAction).mockClear()
    await reviseWith('세 번째 메모')
    await waitFor(() => expect(planDraftAction).toHaveBeenCalledTimes(1))
    expect(planCalls()[0]).toMatchObject({
      revision: { note: '세 번째 메모', earlierNotes: ['열쇠를 목에 건다', '밤에 비가 온다'] },
    })
  })

  it('clears the list on a new plan and on instruction edits', async () => {
    let runs = 0
    vi.mocked(planDraftAction).mockImplementation(async () => {
      runs += 1
      return {
        ok: true,
        data: { runId: `plan-x-${runs}`, card: makeCard(), warnings: [] },
      } as never
    })
    const { rerender: _rerender } = render(<DraftPanel data={makeData()} api={makeApi()} />)
    void _rerender

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')
    await reviseWith('열쇠를 목에 건다')

    // A new plan (not a revision) clears the chain: the next revision sends [].
    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await waitFor(() => expect(planDraftAction).toHaveBeenCalledTimes(3))
    vi.mocked(planDraftAction).mockClear()
    await reviseWith('새 체인의 메모')
    await waitFor(() => expect(planDraftAction).toHaveBeenCalledTimes(1))
    expect(planCalls()[0]).toMatchObject({
      revision: { note: '새 체인의 메모', earlierNotes: [] },
    })

    // Editing the instructions clears the chain too.
    fireEvent.change(screen.getByLabelText('무슨 일이 일어나야 하나요?'), {
      target: { value: '지시가 바뀌었다' },
    })
    vi.mocked(planDraftAction).mockClear()
    await reviseWith('지시 뒤 메모')
    await waitFor(() => expect(planDraftAction).toHaveBeenCalledTimes(1))
    expect(planCalls()[0]).toMatchObject({
      revision: { note: '지시 뒤 메모', earlierNotes: [] },
    })
  })

  it('sends the kept notes as planNotes on the plan draft', async () => {
    vi.mocked(planDraftAction).mockImplementation(async (input: unknown) => {
      const data = input as { revision?: { note: string } }
      const next = makeCard()
      if (data.revision) next.scenes[0] = { ...next.scenes[0]!, summary: data.revision.note }
      return {
        ok: true,
        data: { runId: `plan-1-${String(planCalls().length + 1)}`, card: next, warnings: [] },
      } as never
    })
    vi.mocked(fetch).mockResolvedValue(draftResponse('완성된 초안입니다.'))
    render(<DraftPanel data={makeData()} api={makeApi()} />)

    fireEvent.click(screen.getByRole('button', { name: '계획 세우기' }))
    await screen.findByText('이번 화 계획')
    await reviseWith('열쇠를 목에 건다')
    await screen.findByDisplayValue('열쇠를 목에 건다')

    fireEvent.click(screen.getByRole('button', { name: '이 계획으로 쓰기' }))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(lastFetchBody()).toMatchObject({ planNotes: ['열쇠를 목에 건다'] })
  })
})
