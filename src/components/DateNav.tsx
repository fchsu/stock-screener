'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

interface DateNavProps {
  currentOffset?: number
  onSelectOffset?: (offset: number) => void
}

const DateNav = ({ currentOffset = 0, onSelectOffset }: DateNavProps) => {
  const days = Array.from({ length: 5 }, (_, i) => i)

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {days.map((offset) => {
        const isCurrent = offset === currentOffset
        const label = offset === 0 ? '當天' : `前${offset}天`
        const href = offset === 0 ? '/' : `/?offset=${offset}`

        return (
          <Link
            key={offset}
            href={href}
            prefetch={true}
            onClick={(e) => {
              if (onSelectOffset && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault()
                onSelectOffset(offset)
              }
            }}
            className={buttonVariants({ variant: isCurrent ? 'default' : 'outline' })}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}

export default DateNav
