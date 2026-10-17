import type { NextConfig } from 'next'

// Response headers for every route. Blocks framing (clickjacking) on one-click approval and
// destructive actions, and keeps invite tokens in URL paths out of Referer headers.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
