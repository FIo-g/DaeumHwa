'use client'

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

const AuthEmailContext = createContext<[string, Dispatch<SetStateAction<string>>] | null>(null)

export function AuthEmailProvider({ children }: { children: ReactNode }) {
  const state = useState('')
  return <AuthEmailContext value={state}>{children}</AuthEmailContext>
}

export function useAuthEmail() {
  const shared = useContext(AuthEmailContext)
  const local = useState('')
  return shared ?? local
}
