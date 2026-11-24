// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ProposalView } from '@/server/proposals'
import { AnswerProposals } from './answer-proposals'

vi.mock('@/components/proposals/proposal-card', () => ({
  ProposalCard: ({
    proposal,
    onFinishDecision,
  }: {
    proposal: ProposalView
    onFinishDecision: (id: string, decision: 'approved' | 'rejected' | null) => void
  }) => (
    <>
      <button onClick={() => onFinishDecision(proposal.id, null)}>실패</button>
      <button onClick={() => onFinishDecision(proposal.id, 'approved')}>승인</button>
    </>
  ),
}))

afterEach(cleanup)

it('stamps only a confirmed approval and removes its pending action', () => {
  render(
    <AnswerProposals workId="w1" proposals={[{ id: 'p1' } as ProposalView]} originalCount={1} />,
  )
  expect(screen.getByText('대기 1건')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '실패' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '승인' }))
  expect(screen.getByRole('status')).toHaveTextContent('승인했어요.')
  expect(screen.getByText('대기 0건')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument()
})
