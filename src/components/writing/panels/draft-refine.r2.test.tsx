// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftRefinePreview } from '@/lib/draft-refine'
import { applyDraftRefinementAction } from '@/server/actions/ai-features'
import { DraftRefine } from './draft-refine'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/ai-features', () => ({
  applyDraftRefinementAction: vi.fn(),
}))

const PREVIEW: DraftRefinePreview = {
  runId: 'run-1',
  token: 'token-1',
  changed: true,
  parts: [
    { type: 'equal', value: '민아는 ' },
    { type: 'delete', value: '문을 ' },
    { type: 'insert', value: '창을 ' },
    { type: 'equal', value: '열었다.' },
  ],
  paragraphsBefore: 1,
  paragraphsAfter: 0,
  flagged: 0,
  repaired: 0,
  repairState: 'none',
  beforeChars: 20,
  afterChars: 18,
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  })
}

function renderRefine(onApplied = vi.fn(), onPreviewChange = vi.fn()) {
  render(
    <DraftRefine
      workId="work-1"
      runId="run-1"
      onApplied={onApplied}
      onPreviewChange={onPreviewChange}
    />,
  )
  return { onApplied, onPreviewChange }
}

async function openPreview(preview: DraftRefinePreview = PREVIEW) {
  vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true, data: preview }))
  fireEvent.click(screen.getByRole('button', { name: '다듬기' }))
  return screen.findByRole('region', { name: '다듬기 미리보기' })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('DraftRefine', () => {
  it('shows only the 다듬기 button before the author asks', () => {
    renderRefine()

    expect(screen.getByRole('button', { name: '다듬기' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: '다듬기 미리보기' })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the run id and shows a marked preview without applying', async () => {
    const { onApplied, onPreviewChange } = renderRefine()

    const region = await openPreview()

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/works/work-1/draft/refine')
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ runId: 'run-1' }),
    })
    expect(region.querySelectorAll('ins')).toHaveLength(1)
    expect(region.querySelectorAll('del')).toHaveLength(1)
    expect(screen.getByText('긴 문단 1곳을 고쳤습니다.')).toBeTruthy()
    expect(applyDraftRefinementAction).not.toHaveBeenCalled()
    expect(onApplied).not.toHaveBeenCalled()
    expect(onPreviewChange).toHaveBeenLastCalledWith(true)
    expect(screen.queryByRole('button', { name: '다듬기' })).toBeNull()
  })

  it('적용 calls the action and hands the new text to onApplied', async () => {
    vi.mocked(applyDraftRefinementAction).mockResolvedValue({
      ok: true,
      data: { runId: 'run-1', text: '새 본문' },
    })
    const { onApplied, onPreviewChange } = renderRefine()
    await openPreview()

    fireEvent.click(screen.getByRole('button', { name: '적용' }))

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith('새 본문'))
    expect(applyDraftRefinementAction).toHaveBeenCalledWith({
      workId: 'work-1',
      runId: 'run-1',
      token: 'token-1',
    })
    expect(screen.queryByRole('region', { name: '다듬기 미리보기' })).toBeNull()
    expect(onPreviewChange).toHaveBeenLastCalledWith(false)
    expect(toast.success).toHaveBeenCalledWith('다듬은 초안으로 바꿨습니다.')
  })

  it('버리기 closes the preview and calls nothing', async () => {
    const { onApplied, onPreviewChange } = renderRefine()
    await openPreview()

    fireEvent.click(screen.getByRole('button', { name: '버리기' }))

    expect(screen.queryByRole('region', { name: '다듬기 미리보기' })).toBeNull()
    expect(applyDraftRefinementAction).not.toHaveBeenCalled()
    expect(onApplied).not.toHaveBeenCalled()
    expect(onPreviewChange).toHaveBeenLastCalledWith(false)
  })

  it('keeps the preview and shows the message when apply fails', async () => {
    const message = '초안이 바뀌어 적용할 수 없습니다. 다시 다듬어 주세요.'
    vi.mocked(applyDraftRefinementAction).mockResolvedValue({
      ok: false,
      error: { code: 'BAD_STATE', message },
    })
    const { onApplied } = renderRefine()
    const region = await openPreview()

    fireEvent.click(screen.getByRole('button', { name: '적용' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
    expect(screen.getByRole('region', { name: '다듬기 미리보기' })).toBe(region)
    expect(onApplied).not.toHaveBeenCalled()
  })

  it('says nothing needed fixing when the server found no change', async () => {
    const { onPreviewChange } = renderRefine()
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { ...PREVIEW, changed: false, parts: [], beforeChars: 20, afterChars: 20 },
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '다듬기' }))

    expect(await screen.findByText('다듬을 곳을 찾지 못했습니다.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: '다듬기 미리보기' })).toBeNull()
    expect(onPreviewChange).not.toHaveBeenCalledWith(true)
  })

  it('shows the repair note', async () => {
    renderRefine()
    await openPreview({ ...PREVIEW, repairState: 'failed' })

    expect(
      screen.getByText('문장 고치기는 하지 못했습니다. 문단 다듬기 결과만 보입니다.'),
    ).toBeTruthy()
  })

  it('shows the skipped repair note', async () => {
    renderRefine()
    await openPreview({ ...PREVIEW, repairState: 'skipped' })

    expect(screen.getByText('시간이 모자라 문장 고치기는 건너뛰었습니다.')).toBeTruthy()
  })

  it('cancel stops the run and leaves no preview', async () => {
    renderRefine()
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}))

    fireEvent.click(screen.getByRole('button', { name: '다듬기' }))
    fireEvent.click(await screen.findByRole('button', { name: '취소' }))

    expect(await screen.findByRole('button', { name: '다듬기' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: '다듬기 미리보기' })).toBeNull()
  })
})
