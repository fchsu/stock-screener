import { test, expect } from '@playwright/test'
import { mockScreeningResults } from '../unit/msw/handlers'

test.describe('US1: View Daily Screening Results', () => {
  test.beforeEach(async ({ page }) => {
    // 攔截 Supabase REST API 請求並回傳 Mock 資料
    await page.route('**/rest/v1/screening_results*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockScreeningResults),
      })
    })
  })

  test('should display the current day screening results', async ({ page }) => {
    await page.goto('/')

    // 驗證標題
    await expect(page.locator('h1')).toContainText('自動股票篩選')

    // 驗證載入狀態 (如果有設計載入中提示的話)
    // await expect(page.getByText('載入中...')).toBeVisible()

    // 驗證台股資料是否正確渲染
    const twseSection = page.locator('section', { hasText: '台股' })
    await expect(twseSection).toBeVisible()
    await expect(twseSection.getByText('2330.TW')).toBeVisible()
    await expect(twseSection.getByText('台積電')).toBeVisible()

    // 驗證 TradingView 連結是否正確
    const tsmcLink = twseSection.getByRole('link', { name: /TradingView/i })
    await expect(tsmcLink).toHaveAttribute(
      'href',
      'https://www.tradingview.com/chart/?symbol=TWSE:2330'
    )

    // 驗證美股資料是否正確渲染
    const nasdaqSection = page.locator('section', { hasText: '美股' })
    await expect(nasdaqSection).toBeVisible()
    await expect(nasdaqSection.getByText('NVDA')).toBeVisible()
    await expect(nasdaqSection.getByText('NVIDIA Corporation')).toBeVisible()
  })
})
