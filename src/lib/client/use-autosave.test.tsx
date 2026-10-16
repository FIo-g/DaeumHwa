// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDraft, getDraft, saveDraft } from '@/lib/client/local-store'
import { useAutosave } from '@/lib/client/use-autosave'

type SaveInput = { title: string; body: string; expectedVersion: number }

function okSave(version: number) {
  return { ok: true as const, data: { version, updatedAt: '2026-10-16T01:00:00.000Z' } }
}

/** Lets fake-indexeddb callbacks (scheduled with setImmediate) finish. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve))
  })
}

function setup(
  save: (input: SaveInput) => Promise<unknown>,
  overrides: Partial<{ chapterId: string; initialBody: string; initialVersion: number }> = {},
) {
  return renderHook(() =>
    useAutosave({
      chapterId: overrides.chapterId ?? 'chapter-1',
      initialTitle: '1화',
      initialBody: overrides.initialBody ?? '처음',
      initialVersion: overrides.initialVersion ?? 1,
      save: save as Parameters<typeof useAutosave>[0]['save'],
    }),
  )
}

describe('useAutosave', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    await clearDraft('chapter-1')
    await clearDraft('chapter-2')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves once to the server 3000 ms after the last edit', async () => {
    const save = vi.fn(async () => okSave(2))
    const { result } = setup(save)

    act(() => result.current.setBody('처음 바뀜'))
    act(() => result.current.setBody('처음 바뀜 2'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999)
    })
    expect(save).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ title: '1화', body: '처음 바뀜 2', expectedVersion: 1 })
    expect(result.current.status).toBe('saved')
    expect(result.current.version).toBe(2)
    expect(result.current.lastSavedAt).toEqual(new Date('2026-10-16T01:00:00.000Z'))
  })

  it('clears the local draft after a successful save', async () => {
    const save = vi.fn(async () => okSave(2))
    const { result } = setup(save)
    act(() => result.current.setBody('저장될 본문'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await settle()
    expect(await getDraft('chapter-1')).toBeUndefined()
  })

  it('keeps the local draft and shows error when the server rejects the save', async () => {
    const save = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'BAD_STATE' as const, message: '저장하지 못했습니다.' },
    }))
    const { result } = setup(save)
    act(() => result.current.setBody('최신 본문'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await settle()
    expect(result.current.status).toBe('error')
    expect((await getDraft('chapter-1'))?.body).toBe('최신 본문')
  })

  it('shows offline and keeps the latest body locally when the request fails', async () => {
    const save = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { result } = setup(save)
    act(() => result.current.setBody('네트워크 끊김'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await settle()
    expect(result.current.status).toBe('offline')
    expect((await getDraft('chapter-1'))?.body).toBe('네트워크 끊김')
  })

  it('shows conflict when the server version moved on', async () => {
    const save = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'CONFLICT' as const, message: '다른 곳에서 먼저 저장되었습니다.' },
    }))
    const { result } = setup(save)
    act(() => result.current.setBody('충돌 본문'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await settle()
    expect(result.current.status).toBe('conflict')
  })

  it('does not save while composing and saves after composition ends', async () => {
    const save = vi.fn(async () => okSave(2))
    const { result } = setup(save)
    act(() => result.current.setComposing(true))
    act(() => result.current.setBody('ㄱ'))
    act(() => result.current.setBody('가'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(save).not.toHaveBeenCalled()

    act(() => result.current.setComposing(false))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ title: '1화', body: '가', expectedVersion: 1 })
  })

  it('offers a newer local draft for recovery on mount', async () => {
    await saveDraft('chapter-2', {
      title: '2화',
      body: '로컬에만 있는 본문',
      savedAt: 1,
      baseVersion: 1,
    })
    const save = vi.fn(async () => okSave(2))
    const { result } = setup(save, { chapterId: 'chapter-2', initialBody: '서버 본문' })
    await settle()
    expect(result.current.recoverable?.body).toBe('로컬에만 있는 본문')

    act(() => result.current.acceptRecovery())
    expect(result.current.body).toBe('로컬에만 있는 본문')
    expect(result.current.title).toBe('2화')
    expect(result.current.recoverable).toBeNull()
  })

  it('discards a recovery draft on request', async () => {
    await saveDraft('chapter-2', { title: '1화', body: '버릴 본문', savedAt: 1, baseVersion: 1 })
    const save = vi.fn(async () => okSave(2))
    const { result } = setup(save, { chapterId: 'chapter-2', initialBody: '서버 본문' })
    await settle()
    act(() => result.current.discardRecovery())
    expect(result.current.recoverable).toBeNull()
    await settle()
    expect(await getDraft('chapter-2')).toBeUndefined()
  })
})
