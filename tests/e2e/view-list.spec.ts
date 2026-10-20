import { test, expect } from '@playwright/test'
import { mockScreeningResults } from '../unit/msw/handlers'

test.describe('US1: View Daily Screening Results (Sidebar + K-Line Chart)', () => {
  test.beforeEach(async ({ page }) => {
    // 攔截 Supabase REST API 請求並回傳 Mock 資料
    await page.route('**/rest/v1/screening_results*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockScreeningResults),
      })
    })

    // 攔截站內 K 線 API 請求並回傳 Mock OHLCV 資料
    await page.route('**/api/ohlcv*', async (route) => {
      const url = new URL(route.request().url())
      const symbol = url.searchParams.get('symbol') || '2330.TW'
      const interval = url.searchParams.get('interval') || '1d'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          symbol,
          interval,
          bars: [
            { time: 1700000000, open: 500, high: 520, low: 495, close: 515, volume: 12000 },
            { time: 1700086400, open: 515, high: 530, low: 510, close: 525, volume: 15000 },
          ],
          supportBoundary: 495,
        }),
      })
    })
  })

  test('should display sidebar with 標準圖 / 慣性改變 groups, switch markets, and show K-line chart', async ({
    page,
  }) => {
    await page.goto('/')

    // 驗證標題
    await expect(page.locator('h1')).toContainText('自動股票篩選')

    // 驗證側邊欄兩個群組標題
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()
    await expect(sidebar.getByText(/標準圖/)).toBeVisible()
    await expect(sidebar.getByText(/慣性改變/)).toBeVisible()

    // 驗證預設台股資料與右側 K 線圖工具列
    await expect(sidebar.getByText('2330.TW')).toBeVisible()
    await expect(sidebar.getByText('台積電')).toBeVisible()

    const chartSection = page.locator('section')
    await expect(chartSection.getByRole('button', { name: /60K/ })).toBeVisible()
    await expect(chartSection.getByRole('button', { name: /日K/ })).toBeVisible()
    await expect(chartSection.getByRole('button', { name: /週K/ })).toBeVisible()

    const tsmcLink = chartSection.getByRole('link', { name: /TradingView/i })
    await expect(tsmcLink).toHaveAttribute(
      'href',
      'https://www.tradingview.com/chart/?symbol=TWSE:2330'
    )

    // 切換至美股 Tab 驗證美股清單與圖表切換
    await sidebar.getByRole('tab', { name: /美股/ }).click()
    await expect(sidebar.getByText('NVDA')).toBeVisible()
    await expect(sidebar.getByText('NVIDIA Corporation')).toBeVisible()
  })

  test('should display fetching and failed status when switching market tabs', async ({ page }) => {
    const mockStatusResults = [
      {
        id: 'mock-uuid-3',
        date: '2026-04-18',
        market: 'TWSE',
        status: 'fetching',
        assets: [],
        updated_at: '2026-04-18T07:00:00Z',
      },
      {
        id: 'mock-uuid-4',
        date: '2026-04-18',
        market: 'NASDAQ',
        status: 'failed',
        assets: [],
        updated_at: '2026-04-18T07:00:00Z',
      },
    ]

    await page.route('**/rest/v1/screening_results*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockStatusResults),
      })
    })

    await page.goto('/')

    const sidebar = page.locator('aside')
    await expect(sidebar.getByText('資料抓取中...')).toBeVisible()

    await sidebar.getByRole('tab', { name: /美股/ }).click()
    await expect(sidebar.getByText('抓取失敗')).toBeVisible()
  })
})
