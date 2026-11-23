import { redirect } from 'next/navigation'
import { LandingPage } from '@/components/landing/landing-page'
import { getSessionUser } from '@/server/session'

export default async function Home() {
  const user = await getSessionUser()
  if (user) redirect('/works')
  return <LandingPage />
}
