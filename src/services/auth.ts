'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface AuthUser {
  id: string
  email?: string
}

export function useAuth(): {
  user: AuthUser | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
} {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(() => typeof supabase?.auth?.getSession === 'function')

  useEffect(() => {
    let mounted = true

    if (typeof supabase?.auth?.getSession === 'function') {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!mounted) return
          const sessionUser = data?.session?.user
          setUser(sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null)
          setIsLoading(false)
        })
        .catch(() => {
          if (mounted) setIsLoading(false)
        })
    }

    let unsubscribe: (() => void) | undefined
    if (typeof supabase?.auth?.onAuthStateChange === 'function') {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return
        const sessionUser = session?.user
        setUser(sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null)
      })
      unsubscribe = () => data?.subscription?.unsubscribe()
    }

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      throw new Error('請輸入電子郵件與密碼')
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })
    if (error) {
      throw new Error(error.message)
    }
    if (data?.user) {
      setUser({ id: data.user.id, email: data.user.email })
    }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      throw new Error(error.message)
    }
    setUser(null)
  }, [])

  return { user, isLoading, signIn, signOut }
}
