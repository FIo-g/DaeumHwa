import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'

describe('proxy', () => {
  it('forwards the path and query of a deep link in x-pathname', () => {
    const res = proxy(new NextRequest('http://localhost/invite/abc123?from=mail'))
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/invite/abc123?from=mail')
  })

  it('forwards nested work paths', () => {
    const res = proxy(new NextRequest('http://localhost/works/w1/chapters/c2'))
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/works/w1/chapters/c2')
  })
})
