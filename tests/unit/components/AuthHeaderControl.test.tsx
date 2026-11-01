import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AuthHeaderControl from '@/components/AuthHeaderControl'

describe('AuthHeaderControl', () => {
  it('opens login dialog when unauthenticated and calls onSignIn with email and password', async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined)
    const onSignOut = vi.fn()

    render(
      <AuthHeaderControl user={null} isLoading={false} onSignIn={onSignIn} onSignOut={onSignOut} />
    )

    fireEvent.click(screen.getByRole('button', { name: /登入/ }))
    fireEvent.change(screen.getByLabelText(/電子郵件|Email/i), {
      target: { value: 'owner@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/密碼/i), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /確認登入/ }))

    await waitFor(() => {
      expect(onSignIn).toHaveBeenCalledWith('owner@example.com', 'secret123')
    })
  })

  it('displays user email and triggers onSignOut when authenticated', () => {
    const onSignIn = vi.fn()
    const onSignOut = vi.fn().mockResolvedValue(undefined)

    render(
      <AuthHeaderControl
        user={{ id: 'u-1', email: 'owner@example.com' }}
        isLoading={false}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />
    )

    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /登出/ }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
