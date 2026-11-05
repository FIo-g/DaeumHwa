// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { ActionResult } from '@/lib/result'
import type { ChapterCheckResult } from '@/server/chapter-check'
import { postAction } from './post-json'
import {
  cancelAutoCheck,
  resetAutoChecksForTests,
  startAutoCheck,
  useAutoCheck,
} from './auto-check'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib/client/post-json', () => ({
  postAction: vi.fn(),
}))

function okResult(
  issues: unknown[] = [],
  proposals: unknown[] = [],
): ActionResult<ChapterCheckResult> {
  return {
    ok: true,
    data: { issues, proposals, runIds: [], namingIssueCount: 0 } as unknown as ChapterCheckResult,
  }
}

function emptyResult(): ChapterCheckResult {
  return { issues: [], proposals: [], runIds: [], namingIssueCount: 0 }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  resetAutoChecksForTests()
  vi.useRealTimers()
})

describe('startAutoCheck', () => {
  it('posts to the check route and reports the counts', async () => {
    vi.mocked(postAction).mockResolvedValue(
      okResult([{ id: 'i1' }, { id: 'i2' }], [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]),
    )
    const onDone = vi.fn()
    const navigate = vi.fn()

    const started = startAutoCheck({
      workId: 'w1',
      chapterId: 'c1',
      position: 3,
      onDone,
      navigate,
    })

    expect(started).toBe(true)
    expect(toast).toHaveBeenCalledWith('3화를 완료로 바꿨습니다. 회차 점검을 시작합니다.')
    expect(postAction).toHaveBeenCalledWith(
      '/api/works/w1/chapters/c1/check',
      {},
      { signal: expect.any(AbortSignal) },
    )

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled())

    const [message, options] = vi.mocked(toast.success).mock.calls[0]
    expect(message).toBe('3화 점검을 마쳤습니다.')
    expect(options).toMatchObject({
      description: '지적 2건, 승인 대기 후보 3건',
      duration: 10_000,
    })
    expect(options?.action).toBeDefined()
    const action = options?.action as { label: string; onClick: () => void }
    expect(action.label).toBe('승인 대기 보기')
    action.onClick()
    expect(navigate).toHaveBeenCalledWith('/works/w1/approvals')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('adds the approvals button only when there are candidates', async () => {
    vi.mocked(postAction).mockResolvedValue(okResult())

    startAutoCheck({ workId: 'w1', chapterId: 'c1', position: 3 })

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled())

    const [, options] = vi.mocked(toast.success).mock.calls[0]
    expect(options).not.toHaveProperty('action')
    expect(options).toMatchObject({ description: '지적 0건, 승인 대기 후보 0건' })
  })

  it('runs one check per chapter at a time', () => {
    vi.mocked(postAction).mockImplementation(() => new Promise(() => {}))

    expect(startAutoCheck({ workId: 'w1', chapterId: 'c1', position: 3 })).toBe(true)
    expect(startAutoCheck({ workId: 'w1', chapterId: 'c1', position: 3 })).toBe(false)
    expect(postAction).toHaveBeenCalledTimes(1)

    expect(startAutoCheck({ workId: 'w1', chapterId: 'c2', position: 4 })).toBe(true)
    expect(postAction).toHaveBeenCalledTimes(2)
  })

  it('shows the server message when the check fails', async () => {
    vi.mocked(postAction).mockResolvedValue({
      ok: false,
      error: {
        code: 'AI_LIMIT',
        message: '오늘 AI 사용량 한도를 넘었습니다. 내일 다시 시도해 주세요.',
      },
    })
    const onDone = vi.fn()

    startAutoCheck({ workId: 'w1', chapterId: 'c1', position: 3, onDone })

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('3화 자동 점검을 하지 못했습니다.', {
        description: '오늘 AI 사용량 한도를 넘었습니다. 내일 다시 시도해 주세요.',
      }),
    )
    expect(onDone).not.toHaveBeenCalled()

    vi.mocked(postAction).mockImplementation(() => new Promise(() => {}))
    expect(startAutoCheck({ workId: 'w1', chapterId: 'c1', position: 3 })).toBe(true)
  })

  it('cancels without an error toast', async () => {
    let signal: AbortSignal | undefined
    vi.mocked(postAction).mockImplementation(
      (_url, _body, options) =>
        new Promise((resolve) => {
          signal = options?.signal
          options?.signal?.addEventListener('abort', () =>
            resolve({
              ok: false,
              error: { code: 'CANCELLED', message: '취소했습니다.' },
            }),
          )
        }),
    )

    const { result } = renderHook(() => useAutoCheck('c1'))
    act(() => {
      startAutoCheck({ workId: 'w1', chapterId: 'c1', position: 3 })
    })
    expect(result.current.running).toBe(true)

    act(() => {
      cancelAutoCheck('c1')
    })
    expect(signal?.aborted).toBe(true)
    expect(result.current.running).toBe(false)

    await vi.waitFor(() =>
      expect(
        vi.mocked(toast).mock.calls.filter(([message]) => message === '취소했습니다.'),
      ).toHaveLength(1),
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('keeps the last finished result for the chapter', async () => {
    const data = {
      issues: [{ id: 'i1' }],
      proposals: [],
      runIds: [],
      namingIssueCount: 0,
    } as unknown as ChapterCheckResult
    vi.mocked(postAction).mockResolvedValue({ ok: true, data })
    const { result } = renderHook(() => useAutoCheck('c1'))

    act(() => {
      startAutoCheck({ workId: 'w1', chapterId: 'c1', position: 3 })
    })
    await vi.waitFor(() => expect(result.current.result).toBe(data))
    expect(result.current.running).toBe(false)

    vi.mocked(postAction).mockResolvedValue({
      ok: false,
      error: { code: 'AI_LIMIT', message: '오늘 AI 사용량 한도를 넘었습니다.' },
    })
    act(() => {
      startAutoCheck({ workId: 'w1', chapterId: 'c1', position: 3 })
    })
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())

    expect(result.current).toEqual({ running: false, elapsedSec: 0, result: data })
    expect(result.current.result).toBe(data)
  })

  it('reports running and elapsed seconds through useAutoCheck', async () => {
    vi.useFakeTimers()
    let resolveRun: (result: ActionResult<ChapterCheckResult>) => void = () => {}
    vi.mocked(postAction).mockImplementation(() => new Promise((resolve) => (resolveRun = resolve)))

    const { result } = renderHook(() => useAutoCheck('c1'))
    expect(result.current).toEqual({ running: false, elapsedSec: 0, result: null })

    act(() => {
      startAutoCheck({ workId: 'w1', chapterId: 'c1', position: 3 })
    })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current).toEqual({ running: true, elapsedSec: 2, result: null })

    await act(async () => {
      resolveRun({ ok: true, data: emptyResult() })
    })
    expect(result.current.running).toBe(false)
  })
})
