import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getTaiwanDate(offsetDays = 0): string {
  const d = new Date()
  const twTodayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
  }).format(d)

  if (offsetDays === 0) return twTodayStr

  const [y, m, day] = twTodayStr.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1, day - offsetDays))
  return target.toISOString().split('T')[0]
}
