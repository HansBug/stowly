import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setupI18n } from '../i18n'
import type { JobState } from '../lib/api'
import type { SolveResult } from '../lib/result'
import { SolveProgress } from './SolveProgress'

setupI18n('zh-CN')

const budget = { source: 'auto' as const, timeLimit: 20, stopWhenUnimprovedFor: 5, stopWhenUnimprovedAfter: 4.3, stopWhenUnimprovedRatio: 2, path: 'TSMS', latency: 4.3, typicalLatency: 1.2, improvement: 8.7, alpha: 4, speed: 1 }
const events = [{ time: 1.2, items: 663, bins: 1, profit: 4.2e10, cost: 0, label: 'TSMS n 1' }, { time: 3.5, items: 926, bins: 1, profit: 6.6e10, cost: 0, label: 'TSMS n 8' }]
const running: JobState = { id: 'j', status: 'running', budget, progress: { startedAt: 0, elapsed: 5, events } }
const result = (patch: Partial<SolveResult>): SolveResult => ({ status: 'feasible', solver: 'box', objective: 'knapsack', value: 6.6e10, bound: null, solveTime: 13, wallTime: 13.1, bins: [], counts: [], statistics: {}, options: {}, ...patch })

describe('SolveProgress', () => {
  it('renders nothing without a job', () => {
    const { container } = render(<SolveProgress job={null} solving={false} result={null} volumeValued />)
    expect(container.textContent).toBe('')
  })

  it('shows elapsed time, the latest improvement and the log while running', () => {
    render(<SolveProgress job={running} solving result={null} volumeValued />)
    expect(screen.getByText(/已用 5\.0 s \/ 上限 20 s/)).toBeInTheDocument()
    expect(screen.getByTestId('progress-live').textContent).toContain('926 件 · 1 箱 · 上次改进 1.5 s 前')
    expect(screen.getByTestId('progress-live').textContent).toContain('66.00 m³')
    expect(screen.getByTestId('progress-log').textContent).toContain('3.50 s：926 件 / 1 箱 · TSMS n 8')
    expect(screen.getByText('自动预算')).toBeInTheDocument()
    expect(screen.getByText('算法路径 TSMS')).toBeInTheDocument()
  })

  it('waits for the first solution and shows an empty log', () => {
    render(<SolveProgress job={{ ...running, progress: { startedAt: 0, elapsed: 1, events: [] } }} solving result={null} volumeValued={false} />)
    expect(screen.getByTestId('progress-live').textContent).toContain('等待首个解（预计约 4.3 s）')
    expect(screen.getByTestId('progress-log').textContent).toContain('尚无改进记录')
  })

  it('explains how the run ended', () => {
    const done = { ...running, status: 'done' as const, budget: { ...budget, source: 'manual' as const } }
    const { rerender } = render(<SolveProgress job={done} solving={false} result={result({ stopReason: 'unimproved' })} volumeValued={false} />)
    // the stall stop is relative to the last improvement (3.5 s), so the panel reports the measured silence
    expect(screen.getByTestId('progress-live').textContent).toContain('提前结束：3.5 s 后再无改进（沉默 9.6 s）')
    expect(screen.getByText('手动预算')).toBeInTheDocument()
    expect(screen.getByText(/已用 13\.1 s/)).toBeInTheDocument()
    rerender(<SolveProgress job={done} solving={false} result={result({ stopReason: 'callback' })} volumeValued={false} />)
    expect(screen.getByTestId('progress-live').textContent).toContain('已手动停止')
    rerender(<SolveProgress job={done} solving={false} result={result({ status: 'optimal', stopReason: null })} volumeValued={false} />)
    expect(screen.getByTestId('progress-live').textContent).toContain('已证明最优')
    rerender(<SolveProgress job={done} solving={false} result={result({ stopReason: null })} volumeValued={false} />)
    expect(screen.getByTestId('progress-live').textContent).toContain('达到时间上限')
    rerender(<SolveProgress job={done} solving={false} result={result({ status: 'no-solution', stopReason: null })} volumeValued={false} />)
    expect(screen.getByTestId('progress-live').textContent).toContain('达到时间上限')
    rerender(<SolveProgress job={{ ...done, progress: null }} solving={false} result={null} volumeValued={false} />)
    expect(screen.getByText(/已用 0\.0 s/)).toBeInTheDocument()
  })
})
