import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { setupI18n } from '../i18n'
import { solvedDemo } from '../test/fixtures'
import { ResultPanel } from './ResultPanel'

setupI18n('zh-CN')

describe('ResultPanel', () => {
  it('shows the error, the empty state and the summary', () => {
    const { project, result } = solvedDemo()
    const { rerender } = render(<ResultPanel project={project} result={null} error="boom" selectedBin={0} onExport={vi.fn()} />)
    expect(screen.getByText('求解失败')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    rerender(<ResultPanel project={project} result={null} error={null} selectedBin={0} onExport={vi.fn()} />)
    expect(screen.getByText(/尚未求解/)).toBeInTheDocument()
    const onExport = vi.fn()
    rerender(<ResultPanel project={project} result={result} error={null} selectedBin={0} onExport={onExport} />)
    expect(screen.getByText('可行解（未证明最优）')).toBeInTheDocument()
    // knapsack with default profits: values are volumes
    expect(screen.getByText('74.52 m³ / 76.35 m³')).toBeInTheDocument()
    expect(screen.getAllByText(/未装入 1/)).toHaveLength(3)
    expect(screen.getAllByText('邮政 1 号纸箱').length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: /导出 CSV/ }))
    expect(onExport).toHaveBeenCalled()
  })

  it('formats other objectives as plain numbers', () => {
    const { project, result } = solvedDemo()
    project.settings.objective = 'bin-packing'
    render(<ResultPanel project={project} result={{ ...result, status: 'optimal', value: 1, bound: 1 }} error={null} selectedBin={3} onExport={vi.fn()} />)
    expect(screen.getByText('已证明最优')).toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    render(<ResultPanel project={{ ...project, items: project.items.map((i) => ({ ...i, profit: 2 })) }} result={{ ...result, value: 1234567.5, bound: null }} error={null} selectedBin={0} onExport={vi.fn()} />)
    expect(screen.getByText('1,234,567.5 / -')).toBeInTheDocument()
  })
})
