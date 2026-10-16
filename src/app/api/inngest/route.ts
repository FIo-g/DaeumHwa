import { serve } from 'inngest/next'
import type { NextRequest } from 'next/server'
import { inngest, isInngestEnabled } from '@/inngest/client'
import { importRun } from '@/inngest/functions'

// Inngest endpoint. Inactive (404) unless INNGEST_EVENT_KEY or INNGEST_DEV=1 is set; then the
// Inngest SDK handles registration, dev-server sync and step execution.

export const runtime = 'nodejs'
export const maxDuration = 300

const handler = serve({ client: inngest, functions: [importRun] })

function inactive(): Response {
  return Response.json({ error: 'Inngest가 설정되어 있지 않습니다.' }, { status: 404 })
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isInngestEnabled()) return inactive()
  return handler.GET(request, undefined)
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isInngestEnabled()) return inactive()
  return handler.POST(request, undefined)
}

export async function PUT(request: NextRequest): Promise<Response> {
  if (!isInngestEnabled()) return inactive()
  return handler.PUT(request, undefined)
}
