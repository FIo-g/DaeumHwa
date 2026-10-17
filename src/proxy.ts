import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Forwards the requested path and query to server components in the `x-pathname` request header.
// The (app) layout reads it so a signed-out visitor is sent back to the original page after login.
// Auth itself is still checked in layouts, pages and actions, not here.
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/works/:path*', '/invite/:path*'],
}
