import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DateNav from '@/components/DateNav'

describe('DateNav', () => {
  it('should render links for current day and past 4 days', () => {
    // 預設 offset 為 0
    render(<DateNav currentOffset={0} />)

    // 當天
    const todayLink = screen.getByRole('link', { name: '當天' })
    expect(todayLink).toHaveAttribute('href', '/')
    expect(todayLink).toHaveClass('bg-primary') // default variant has bg-primary
    
    // 前1天
    const day1Link = screen.getByRole('link', { name: '前1天' })
    expect(day1Link).toHaveAttribute('href', '/?offset=1')
    expect(day1Link).not.toHaveClass('bg-primary')

    // 前4天
    const day4Link = screen.getByRole('link', { name: '前4天' })
    expect(day4Link).toHaveAttribute('href', '/?offset=4')
  })

  it('should highlight the active offset link', () => {
    render(<DateNav currentOffset={2} />)

    const day2Link = screen.getByRole('link', { name: '前2天' })
    expect(day2Link).toHaveAttribute('href', '/?offset=2')
    expect(day2Link).toHaveClass('bg-primary')
    
    const todayLink = screen.getByRole('link', { name: '當天' })
    expect(todayLink).not.toHaveClass('bg-primary')
  })
})
