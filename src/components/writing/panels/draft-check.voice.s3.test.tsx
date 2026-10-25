// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftCheckResult } from '@/server/draft-check'
import { DraftCheck } from './draft-check'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/server/actions/ai-features', () => ({
  createChapterFromDraftAction: vi.fn(),
  applyDraftRefinementAction: vi.fn(),
  applySceneFixAction: vi.fn(),
  discardSceneFixAction: vi.fn(),
  draftFindingsAction: vi.fn(),
  planDraftAction: vi.fn(),
  recordDraftUseAction: vi.fn(),
}))

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  })
}

describe('DraftCheck voice lines (stage 3 task 8)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.resetAllMocks()
  })

  it('shows 말투를 고친 대사 2줄', async () => {
    const result: DraftCheckResult = {
      findings: [],
      fix: {
        scenes: [],
        parts: [{ type: 'equal', value: '민준은 문을 열었다.' }],
        token: 'token-1',
        voiceLines: 2,
      },
      notice: null,
    }
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true, data: result }))
    render(
      <DraftCheck workId="work-1" runId="run-1" onApplied={vi.fn()} onPreviewChange={vi.fn()} />,
    )

    expect(await screen.findByText('말투를 고친 대사 2줄')).toBeTruthy()
  })
})
