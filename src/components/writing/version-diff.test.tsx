// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VersionDiff } from './version-diff'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/manuscript', () => ({
  getVersionAction: () => Promise.resolve({ ok: false }),
  restoreVersionAction: vi.fn(),
}))

afterEach(cleanup)

describe('VersionDiff', () => {
  it.each([
    [2, '와'],
    [3, '과'],
    [10, '과'],
  ])('uses the Korean pronunciation of version %i', async (versionNumber, particle) => {
    render(
      <VersionDiff
        workId="work"
        chapterId="chapter"
        versionId="version"
        versionNumber={versionNumber}
        currentBody=""
        currentVersion={11}
        canRestore={false}
        replay={false}
      />,
    )
    const comparison = screen.getByRole('region', { name: '버전 비교' })
    expect(comparison.querySelector('h2')?.textContent).toBe(
      `버전 ${versionNumber}${particle} 현재 원고 비교`,
    )
    await screen.findByText('버전을 불러오지 못했어요.')
  })
})
