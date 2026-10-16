import { redirect } from 'next/navigation'
import { getSessionUser } from '@/server/session'

export default async function Home() {
  const user = await getSessionUser()
  redirect(user ? '/works' : '/login')
}
