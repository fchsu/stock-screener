import { test, expect } from '@playwright/test'
import type { ScreeningResult } from '@/lib/database.types'

const e2eScreeningResults: ScreeningResult[] = [
  {
    id: 'e2e-twse-1',
    date: '2026-11-01',
    market: 'TWSE',
    status: 'completed',
    assets: [
      {
        symbol: '2330.TW',
        name: '台積電',
        market: 'TWSE',
        matchLevel: 'strict',
        tradingViewUrl: 'https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE:2330',
        tradingDate: '2026-11-01',
      },
      {
        symbol: '2014.TW',
        name: '中鴻',
        market: 'TWSE',
        matchLevel: 'momentum',
        tradingViewUrl: 'https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE:2014',
        tradingDate: '2026-11-01',
      },
    ],
    updated_at: '2026-11-01T07:15:00Z',
  },
]

test.describe('Authentication & Watchlist End-to-End Flow', () => {
  test('hides watchlist for guests, allows login, switches chart on clicking +, manages groups/items, and resets tab on logout', async ({
    page,
  }) => {
    // 攔截篩選結果與 K 線圖 API
    await page.route('**/rest/v1/screening_results*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(e2eScreeningResults),
      })
    })

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

    // 攔截 Supabase Auth API
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'owner-uuid-1',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'owner@example.com',
          },
        }),
      })
    })

    await page.route('**/auth/v1/logout*', async (route) => {
      await route.fulfill({ status: 204, body: '' })
    })

    // 攔截觀察清單相關 Supabase REST API
    await page.route('**/rest/v1/watchlists*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'wl-main',
              user_id: 'owner-uuid-1',
              name: '主力觀察',
              sort_order: 0,
              created_at: '2026-11-01T00:00:00Z',
              updated_at: '2026-11-01T00:00:00Z',
            },
          ]),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.route('**/rest/v1/watchlist_groups*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'grp-semi',
              watchlist_id: 'wl-main',
              name: '半導體',
              sort_order: 0,
              created_at: '2026-11-01T00:00:00Z',
            },
          ]),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.route('**/rest/v1/watchlist_items*', async (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'item-tsmc',
              watchlist_id: 'wl-main',
              group_id: 'grp-semi',
              symbol: '2330.TW',
              name: '台積電',
              market: 'TWSE',
              sort_order: 0,
              created_at: '2026-11-01T00:00:00Z',
            },
          ]),
        })
        return
      }
      if (method === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}')
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'item-added-2014',
            watchlist_id: payload.watchlist_id ?? 'wl-main',
            group_id: null,
            symbol: payload.symbol ?? '2014.TW',
            name: payload.name ?? '中鴻',
            market: payload.market ?? 'TWSE',
            sort_order: payload.sort_order ?? 0,
            created_at: '2026-11-01T01:00:00Z',
          }),
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.goto('/')

    const sidebar = page.locator('aside')
    await expect(sidebar.getByText('台積電')).toBeVisible()
    await expect(sidebar.getByText('中鴻')).toBeVisible()

    // 1. 未登入時：左側邊欄不顯示「★ 清單」Tab，也不顯示「+」按鈕
    await expect(sidebar.getByRole('tab', { name: /清單/ })).toHaveCount(0)
    await expect(sidebar.getByRole('button', { name: /加入觀察清單/ })).toHaveCount(0)

    // 2. 點擊頂部「登入」並輸入帳密
    await page.getByRole('button', { name: '登入' }).click()
    await page.getByLabel(/電子郵件|Email/i).fill('owner@example.com')
    await page.getByLabel(/密碼/i).fill('secret123')
    await page.getByRole('button', { name: '確認登入' }).click()

    await expect(page.getByText('owner@example.com')).toBeVisible()
    await expect(sidebar.getByRole('tab', { name: /清單/ })).toBeVisible()

    // 3. 點擊「中鴻 (2014.TW)」右側的「+」按鈕：驗證同時切換右側 K 線圖並加入觀察清單底部
    await sidebar.getByRole('button', { name: '加入觀察清單：中鴻' }).click()
    const tvLink = page.locator('section').getByRole('link', { name: /在 TradingView 開啟/i })
    await expect(tvLink).toHaveAttribute(
      'href',
      'https://tw.tradingview.com/chart/eEagIIPe/?symbol=TWSE:2014'
    )

    // 選擇「主力觀察」清單加入
    await sidebar.getByRole('button', { name: /主力觀察/ }).click()

    // 4. 切換至「★ 清單」Tab 檢查群組與未分類標的
    await sidebar.getByRole('tab', { name: /清單/ }).click()
    const semiGroup = sidebar.getByTestId('watchlist-group-grp-semi')
    const ungroupedSection = sidebar.getByTestId('watchlist-group-ungrouped')
    await expect(semiGroup).toContainText('半導體')
    await expect(semiGroup).toContainText('台積電')
    await expect(ungroupedSection).toContainText('中鴻')

    // 刪除「半導體」群組後，「台積電」應自動退回底部的「未分類」區塊
    await sidebar.getByRole('button', { name: '刪除群組：半導體' }).click()
    await expect(sidebar.getByTestId('watchlist-group-grp-semi')).toHaveCount(0)
    await expect(ungroupedSection).toContainText('台積電')
    await expect(ungroupedSection).toContainText('中鴻')

    // 5. 點擊「登出」：驗證自動退回「台股」Tab 且隱藏「★ 清單」Tab
    await page.getByRole('button', { name: '登出' }).click()
    await expect(sidebar.getByRole('tab', { name: /清單/ })).toHaveCount(0)
    await expect(sidebar.getByRole('tab', { name: /台股/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })
})
