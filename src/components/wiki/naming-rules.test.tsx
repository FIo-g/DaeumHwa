// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from '@/lib/client/run-action'
import { createNamingRuleAction } from '@/server/actions/wiki'
import { NamingRules } from './naming-rules'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/server/actions/wiki', () => ({
  createNamingRuleAction: vi.fn(),
  updateNamingRuleAction: vi.fn(),
  archiveNamingRuleAction: vi.fn(),
}))

vi.mock('@/lib/client/run-action', () => ({
  runAction: vi.fn(),
}))

const run = vi.mocked(runAction)
const create = vi.mocked(createNamingRuleAction)

const rules = [{ id: 'r1', canonical: '서윤', variants: ['서연', '서유'], note: '주인공 이름' }]

beforeEach(() => {
  run.mockResolvedValue({ id: 'r2' } as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('NamingRules', () => {
  it('lists the correct spelling with its wrong spellings as chips', () => {
    render(<NamingRules workId="w1" rules={rules} canEdit />)
    const row = screen.getByText('서윤').closest('tr') as HTMLElement
    expect(within(row).getByText('서연')).toBeInTheDocument()
    expect(within(row).getByText('서유')).toBeInTheDocument()
    expect(within(row).getByText('주인공 이름')).toBeInTheDocument()
  })

  it('creates a rule with trimmed, split wrong spellings', async () => {
    render(<NamingRules workId="w1" rules={[]} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: '표기 규칙 추가' }))
    fireEvent.change(screen.getByLabelText('올바른 표기'), { target: { value: ' 도현 ' } })
    fireEvent.change(screen.getByLabelText('잘못된 표기 (쉼표로 구분)'), {
      target: { value: '도연, 도현이, ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({
      workId: 'w1',
      canonical: '도현',
      variants: ['도연', '도현이'],
      note: '',
    })
  })

  it('hides write controls from viewers', () => {
    render(<NamingRules workId="w1" rules={rules} canEdit={false} />)
    expect(screen.queryByRole('button', { name: '표기 규칙 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
  })
})
