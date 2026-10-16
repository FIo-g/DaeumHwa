import { connection } from 'next/server'
import { toNextJsHandler } from 'better-auth/next-js'
import { getAuth } from '@/lib/auth'

export async function GET(request: Request) {
  await connection()
  return toNextJsHandler(getAuth()).GET(request)
}

export async function POST(request: Request) {
  await connection()
  return toNextJsHandler(getAuth()).POST(request)
}
