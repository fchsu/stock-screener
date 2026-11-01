'use client'

import { useState, type FormEvent } from 'react'
import type { AuthUser } from '@/services/auth'

export interface AuthHeaderControlProps {
  user: AuthUser | null
  isLoading: boolean
  onSignIn: (email: string, password: string) => Promise<void>
  onSignOut: () => Promise<void>
}

export default function AuthHeaderControl({
  user,
  isLoading,
  onSignIn,
  onSignOut,
}: AuthHeaderControlProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isLoading) {
    return (
      <span className="text-xs text-gray-400 dark:text-gray-500" aria-live="polite">
        驗證中...
      </span>
    )
  }

  if (user) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="max-w-36 truncate font-mono text-gray-600 dark:text-gray-300">
          {user.email ?? '已登入'}
        </span>
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          登出
        </button>
      </div>
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setIsSubmitting(true)
    try {
      await onSignIn(email, password)
      setIsOpen(false)
      setEmail('')
      setPassword('')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '登入失敗，請檢查帳號密碼')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev)
          setErrorMsg(null)
        }}
        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700"
      >
        登入
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="管理員登入"
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-800 dark:bg-gray-950"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">管理員登入</h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="關閉登入視窗"
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                電子郵件 (Email)
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                密碼
              </label>
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? '登入中...' : '確認登入'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
