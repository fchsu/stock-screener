import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Providers from '@/components/Providers'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: '自動股票篩選',
  description: '老余三問股票篩選結果清單',
  icons: {
    icon: 'data:image/x-icon;base64,', // 強制瀏覽器不要發出 request
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-TW" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex h-dvh flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <Providers>
          <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-2.5 py-2">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
