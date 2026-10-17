import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'

describe('security response headers', () => {
  it('sends framing, sniffing and referrer protection on every path', async () => {
    const rules = await nextConfig.headers?.()
    const rule = rules?.find((r) => r.source === '/:path*')
    const headers = Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]))

    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'")
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })
})
