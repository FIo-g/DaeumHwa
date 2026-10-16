// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WikiTabs } from './wiki-tabs'

afterEach(() => {
  cleanup()
})

describe('WikiTabs', () => {
  it('links each tab and marks the active one', () => {
    render(<WikiTabs workId="w1" active="world" />)
    expect(screen.getByRole('link', { name: '세계관' })).toHaveAttribute(
      'href',
      '/works/w1/wiki?tab=world',
    )
    expect(screen.getByRole('link', { name: '세계관' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '인물' })).not.toHaveAttribute('aria-current')
  })

  it('links the threads and graph tabs to their own pages', () => {
    render(<WikiTabs workId="w1" active="characters" />)
    expect(screen.getByRole('link', { name: '떡밥 장부' })).toHaveAttribute(
      'href',
      '/works/w1/wiki/threads',
    )
    expect(screen.getByRole('link', { name: '관계 그래프' })).toHaveAttribute(
      'href',
      '/works/w1/wiki/graph',
    )
  })
})
