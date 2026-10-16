import { describe, expect, it } from 'vitest'
import {
  type GraphEdge,
  type GraphNode,
  defaultPosition,
  formatRelationRange,
  isEdgeVisible,
  isNodeVisible,
  visibleGraph,
} from './graph-model'

const alice: GraphNode = { id: 'a', name: '서윤', kind: 'character', firstAppearance: 1 }
const bob: GraphNode = { id: 'b', name: '도현', kind: 'character', firstAppearance: 5 }
const castle: GraphNode = { id: 'c', name: '성', kind: 'place', firstAppearance: null }

function edge(
  id: string,
  source: string,
  target: string,
  start: number | null,
  end: number | null,
): GraphEdge {
  return {
    id,
    source,
    target,
    kind: '동료',
    description: '',
    directed: false,
    startPosition: start,
    endPosition: end,
  }
}

describe('isNodeVisible', () => {
  it('hides cards whose first appearance is after the position', () => {
    expect(isNodeVisible(bob, 4, [])).toBe(false)
    expect(isNodeVisible(bob, 5, [])).toBe(true)
  })

  it('always shows cards without an appearance record', () => {
    expect(isNodeVisible(castle, 1, [])).toBe(true)
  })

  it('shows every card when no position is set (전체 보기)', () => {
    expect(isNodeVisible(bob, null, [])).toBe(true)
  })

  it('hides cards of a hidden kind', () => {
    expect(isNodeVisible(castle, null, ['place'])).toBe(false)
    expect(isNodeVisible(alice, null, ['place'])).toBe(true)
  })
})

describe('isEdgeVisible', () => {
  it('shows an edge only inside its chapter range', () => {
    const e = edge('e', 'a', 'b', 3, 6)
    expect(isEdgeVisible(e, 2)).toBe(false)
    expect(isEdgeVisible(e, 3)).toBe(true)
    expect(isEdgeVisible(e, 6)).toBe(true)
    expect(isEdgeVisible(e, 7)).toBe(false)
  })

  it('treats a null start as open from the beginning and a null end as open-ended', () => {
    expect(isEdgeVisible(edge('e', 'a', 'b', null, 4), 1)).toBe(true)
    expect(isEdgeVisible(edge('e', 'a', 'b', 4, null), 99)).toBe(true)
    expect(isEdgeVisible(edge('e', 'a', 'b', null, 4), 5)).toBe(false)
  })

  it('shows every edge when no position is set', () => {
    expect(isEdgeVisible(edge('e', 'a', 'b', 9, 9), null)).toBe(true)
  })
})

describe('visibleGraph', () => {
  const data = {
    nodes: [alice, bob, castle],
    edges: [edge('e1', 'a', 'b', 1, null), edge('e2', 'a', 'c', null, null)],
  }

  it('drops an edge whose end is hidden by the chapter or kind filter', () => {
    const atTwo = visibleGraph(data, 2, [])
    expect([...atTwo.nodeIds].sort()).toEqual(['a', 'c'])
    expect([...atTwo.edgeIds]).toEqual(['e2'])
  })

  it('keeps everything when the position is null and no kind is hidden', () => {
    const all = visibleGraph(data, null, [])
    expect(all.nodeIds.size).toBe(3)
    expect(all.edgeIds.size).toBe(2)
  })
})

describe('defaultPosition', () => {
  it('starts at the latest chapter and never below 1', () => {
    expect(defaultPosition(12)).toBe(12)
    expect(defaultPosition(0)).toBe(1)
  })
})

describe('formatRelationRange', () => {
  it('describes open and closed ranges', () => {
    expect(formatRelationRange(null, null)).toBe('전 기간')
    expect(formatRelationRange(3, null)).toBe('3화부터')
    expect(formatRelationRange(null, 8)).toBe('8화까지')
    expect(formatRelationRange(3, 8)).toBe('3화부터 8화까지')
  })
})
