import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ChartDrawingToolbar from '@/components/ChartDrawingToolbar'
import type { ChartDrawing, DrawingStyle } from '@/lib/types'

const defaultStyle: DrawingStyle = {
  color: '#3b82f6',
  lineWidth: 2,
  lineStyle: 'solid',
}

const sampleSelectedDrawing: ChartDrawing = {
  id: 'd-1',
  user_id: 'u-1',
  symbol: '2330.TW',
  tool_type: 'horizontal',
  points: [{ time: 1700000000, price: 500 }],
  style: defaultStyle,
  created_at: '',
  updated_at: '',
}

describe('ChartDrawingToolbar', () => {
  it('switches tools, updates style (color, lineWidth, lineStyle), and triggers delete/clear callbacks', () => {
    const onSelectTool = vi.fn()
    const onChangeStyle = vi.fn()
    const onDeleteSelected = vi.fn()
    const onClearAll = vi.fn()

    render(
      <ChartDrawingToolbar
        activeTool="cursor"
        onSelectTool={onSelectTool}
        currentStyle={defaultStyle}
        onChangeStyle={onChangeStyle}
        selectedDrawing={sampleSelectedDrawing}
        drawingCount={3}
        onDeleteSelected={onDeleteSelected}
        onClearAll={onClearAll}
      />
    )

    // 切換至水平線與路徑工具
    fireEvent.click(screen.getByRole('button', { name: /水平線/ }))
    expect(onSelectTool).toHaveBeenCalledWith('horizontal')

    fireEvent.click(screen.getByRole('button', { name: /路徑/ }))
    expect(onSelectTool).toHaveBeenCalledWith('path')

    // 切換顏色、線寬與虛實線
    fireEvent.click(screen.getByRole('button', { name: '畫線顏色 #ef4444' }))
    expect(onChangeStyle).toHaveBeenCalledWith({ color: '#ef4444' })

    fireEvent.click(screen.getByRole('button', { name: '線寬 3px' }))
    expect(onChangeStyle).toHaveBeenCalledWith({ lineWidth: 3 })

    fireEvent.click(screen.getByRole('button', { name: '虛線' }))
    expect(onChangeStyle).toHaveBeenCalledWith({ lineStyle: 'dashed' })

    // 刪除選取與清除全部
    fireEvent.click(screen.getByRole('button', { name: /刪除選取畫線/ }))
    expect(onDeleteSelected).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /清除全部畫線/ }))
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it('disables horizontal and path drawing tools when 50 drawings limit is reached', () => {
    render(
      <ChartDrawingToolbar
        activeTool="cursor"
        onSelectTool={vi.fn()}
        currentStyle={defaultStyle}
        onChangeStyle={vi.fn()}
        selectedDrawing={null}
        drawingCount={50}
        onDeleteSelected={vi.fn()}
        onClearAll={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /水平線/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /路徑/ })).toBeDisabled()
    expect(screen.getByText('50/50')).toBeInTheDocument()
  })
})
