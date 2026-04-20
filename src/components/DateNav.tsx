import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

interface DateNavProps {
  currentOffset?: number
}

const DateNav = ({ currentOffset = 0 }: DateNavProps) => {
  const days = Array.from({ length: 5 }, (_, i) => i)

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {days.map((offset) => {
        const isCurrent = offset === currentOffset
        const label = offset === 0 ? '當天' : `前${offset}天`
        // 為了確保重置其他 query parameters，或直接跳轉，我們可以直接給 href
        const href = offset === 0 ? '/' : `/?offset=${offset}`

        return (
          <Link
            key={offset}
            href={href}
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
