// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearUserDrafts, draftKey, getDraft, saveDraft } from '@/lib/client/local-store'
import { flushPendingSaves, useAutosave } from '@/lib/client/use-autosave'

type SaveInput = { title: string; body: string; expectedVersion: number; keepHistory?: boolean }

const USER = 'user-1'

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
  overrides: Partial<{
    chapterId: string
    userId: string | undefined
    initialBody: string
    initialVersion: number
  }> = {},
) {
  return renderHook(() =>
    useAutosave({
      chapterId: overrides.chapterId ?? 'chapter-1',
      userId: 'userId' in overrides ? overrides.userId : USER,
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
    await clearUserDrafts(USER)
    await clearUserDrafts('user-2')
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    Reflect.deleteProperty(document, 'visibilityState')
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
    expect(await getDraft(draftKey(USER, 'chapter-1'))).toBeUndefined()
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
    expect((await getDraft(draftKey(USER, 'chapter-1')))?.body).toBe('최신 본문')
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
    expect((await getDraft(draftKey(USER, 'chapter-1')))?.body).toBe('네트워크 끊김')
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
    await saveDraft(draftKey(USER, 'chapter-2'), {
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
    await saveDraft(draftKey(USER, 'chapter-2'), {
      title: '1화',
      body: '버릴 본문',
      savedAt: 1,
      baseVersion: 1,
    })
    const save = vi.fn(async () => okSave(2))
    const { result } = setup(save, { chapterId: 'chapter-2', initialBody: '서버 본문' })
    await settle()
    act(() => result.current.discardRecovery())
    expect(result.current.recoverable).toBeNull()
    await settle()
    expect(await getDraft(draftKey(USER, 'chapter-2'))).toBeUndefined()
  })

  it('offers a draft based on an older server version as stale and keeps it in storage', async () => {
    await saveDraft(draftKey(USER, 'chapter-2'), {
      title: '1화',
      body: '기기 본문',
      savedAt: 1,
      baseVersion: 1,
    })
    const save = vi.fn(async () => okSave(4))
    const { result } = setup(save, {
      chapterId: 'chapter-2',
      initialBody: '서버 본문',
      initialVersion: 3,
    })
    await settle()
    expect(result.current.recoverable?.body).toBe('기기 본문')
    expect(result.current.recoverableStale).toBe(true)
    expect(await getDraft(draftKey(USER, 'chapter-2'))).toBeDefined()
  })

  it('does not mark a draft from the current server version as stale', async () => {
    await saveDraft(draftKey(USER, 'chapter-2'), {
      title: '1화',
      body: '기기 본문',
      savedAt: 1,
      baseVersion: 3,
    })
    const save = vi.fn(async () => okSave(4))
    const { result } = setup(save, {
      chapterId: 'chapter-2',
      initialBody: '서버 본문',
      initialVersion: 3,
    })
    await settle()
    expect(result.current.recoverable?.body).toBe('기기 본문')
    expect(result.current.recoverableStale).toBe(false)
  })

  it('drops a device draft whose text already matches the server copy', async () => {
    await saveDraft(draftKey(USER, 'chapter-2'), {
      title: '1화',
      body: '서버 본문',
      savedAt: 1,
      baseVersion: 1,
    })
    const save = vi.fn(async () => okSave(4))
    const { result } = setup(save, {
      chapterId: 'chapter-2',
      initialBody: '서버 본문',
      initialVersion: 3,
    })
    await settle()
    expect(result.current.recoverable).toBeNull()
    expect(await getDraft(draftKey(USER, 'chapter-2'))).toBeUndefined()
  })

  it('does not offer a draft that another user left on this browser', async () => {
    await saveDraft(draftKey('user-2', 'chapter-2'), {
      title: '1화',
      body: '다른 사람 본문',
      savedAt: 1,
      baseVersion: 1,
    })
    const save = vi.fn(async () => okSave(2))
    const { result } = setup(save, { chapterId: 'chapter-2', initialBody: '서버 본문' })
    await settle()
    expect(result.current.recoverable).toBeNull()
  })

  it('keeps no device draft when the user id is not known', async () => {
    const save = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { result } = setup(save, { userId: undefined })
    act(() => result.current.setBody('로컬에 남지 않음'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await settle()
    expect(result.current.status).toBe('offline')
    expect(await getDraft(draftKey(USER, 'chapter-1'))).toBeUndefined()
  })

  it('keeps the edit typed during a save in a device draft with the new version', async () => {
    let resolveSave: (value: unknown) => void = () => {}
    const save = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        }),
    )
    const { result } = setup(save)
    act(() => result.current.setBody('A'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(save).toHaveBeenCalledTimes(1)

    // The author types more and hides the tab while the first save is still in flight.
    act(() => result.current.setBody('AB'))
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    resolveSave(okSave(2))
    await settle()

    expect(await getDraft(draftKey(USER, 'chapter-1'))).toMatchObject({
      body: 'AB',
      baseVersion: 2,
    })
  })

  it('saves a recovered stale draft with keepHistory so the other copy stays in history', async () => {
    await saveDraft(draftKey(USER, 'chapter-2'), {
      title: '1화',
      body: '기기 본문',
      savedAt: 1,
      baseVersion: 1,
    })
    const save = vi.fn(async () => okSave(4))
    const { result } = setup(save, {
      chapterId: 'chapter-2',
      initialBody: '서버 본문',
      initialVersion: 3,
    })
    await settle()
    act(() => result.current.acceptRecovery())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(save).toHaveBeenCalledWith({
      title: '1화',
      body: '기기 본문',
      expectedVersion: 3,
      keepHistory: true,
    })
  })

  it('flushPendingSaves saves the open edit and reports true when it is stored', async () => {
    const save = vi.fn(async () => okSave(2))
    const { result } = setup(save)
    act(() => result.current.setBody('보내기 전'))
    let clean = false
    await act(async () => {
      clean = await flushPendingSaves()
    })
    expect(save).toHaveBeenCalledWith({ title: '1화', body: '보내기 전', expectedVersion: 1 })
    expect(clean).toBe(true)
  })

  it('flushPendingSaves reports false when the save fails so drafts are kept', async () => {
    const save = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { result } = setup(save)
    act(() => result.current.setBody('보내지 못함'))
    let clean = true
    await act(async () => {
      clean = await flushPendingSaves()
    })
    expect(clean).toBe(false)
  })
})
