import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { setupI18n } from '../i18n'
import { presets } from '../test/fixtures'
import { PresetDrawer } from './PresetDrawer'

setupI18n('zh-CN')

describe('PresetDrawer', () => {
  it('lists presets by category, filters them and adds one', () => {
    const onAdd = vi.fn()
    render(<PresetDrawer open kind="containers" presets={presets} language="zh-CN" onClose={vi.fn()} onAdd={onAdd} />)
    expect(screen.getByText('ISO 集装箱')).toBeInTheDocument()
    expect(screen.getByText('40 尺高柜')).toBeInTheDocument()
    expect(screen.getByText(/载重: 26460 kg/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /添\s*加/ }))
    expect(onAdd).toHaveBeenCalledWith(presets.containers[0])
    fireEvent.change(screen.getByPlaceholderText('搜索'), { target: { value: 'nothing-matches' } })
    expect(screen.queryByText('40 尺高柜')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('搜索'), { target: { value: "40' hq" } })
    expect(screen.getByText('40 尺高柜')).toBeInTheDocument()
  })

  it('renders cargo presets in English and copes with missing presets', () => {
    const { rerender } = render(<PresetDrawer open kind="items" presets={presets} language="en-US" onClose={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.getByText('China Post carton no. 1')).toBeInTheDocument()
    expect(screen.getByText(/0\.5 kg/)).toBeInTheDocument()
    rerender(<PresetDrawer open kind="items" presets={null} language="en-US" onClose={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.queryByText('China Post carton no. 1')).not.toBeInTheDocument()
  })
})
