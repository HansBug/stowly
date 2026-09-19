import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { setupI18n } from '../i18n'
import { demoProject, emptyProject } from '../lib/project'
import { pickOption } from '../test/fixtures'
import type { Budget } from '../lib/api'

const numberInput = (testId: string): HTMLElement => {
  const el = screen.getByTestId(testId)
  return el.tagName === 'INPUT' ? el : (el.querySelector('input') as HTMLElement)
}
import { SettingsPanel } from './SettingsPanel'

const noCalibration = { speed: 1, samples: 0 }
const budget: Budget = { source: 'auto', timeLimit: 21, stopWhenUnimprovedFor: 9.2, stopWhenUnimprovedAfter: 10.5, path: 'SOR', latency: 2.7, typicalLatency: 2.7, improvement: 18.3, alpha: 8, speed: 1 }
const extra = { recommendation: null, calibration: noCalibration, onResetCalibration: () => undefined }

setupI18n('zh-CN')

describe('SettingsPanel', () => {
  it('lists the problems of an empty project and disables solving', () => {
    render(<SettingsPanel project={emptyProject()} solving={false} onChange={vi.fn()} onSolve={vi.fn()} {...extra} />)
    expect(screen.getByText(/至少需要一个容器/)).toBeInTheDocument()
    expect(screen.getByTestId('solve-button')).toBeDisabled()
  })

  it('reports the volume ratio and forwards every setting', () => {
    const onChange = vi.fn()
    const onSolve = vi.fn()
    render(<SettingsPanel project={demoProject()} solving={false} onChange={onChange} onSolve={onSolve} {...extra} />)
    expect(screen.getByText(/货物总体积 81\.63 m³/)).toBeInTheDocument()
    pickOption(0, 'box')
    expect(onChange).toHaveBeenCalledWith({ solver: 'box' })
    pickOption(1, '装箱：容器最少')
    expect(onChange).toHaveBeenCalledWith({ objective: 'bin-packing' })
    pickOption(2, '确定性（可复现）')
    expect(onChange).toHaveBeenCalledWith({ optimizationMode: 'not-anytime-deterministic' })
    fireEvent.click(screen.getByTestId('solve-button'))
    expect(onSolve).toHaveBeenCalled()
  })

  it('shows the running state', () => {
    render(<SettingsPanel project={demoProject()} solving onChange={vi.fn()} onSolve={vi.fn()} {...extra} />)
    expect(screen.getByTestId('solve-button').textContent).toContain('求解中')
  })

  it('enables the unloading constraint for boxstacks only and explains upright placement', () => {
    const onChange = vi.fn()
    const stacked = demoProject()
    const project = { ...stacked, settings: { ...stacked.settings, solver: 'box' as const } }
    const { rerender } = render(<SettingsPanel project={project} solving={false} onChange={onChange} onSolve={vi.fn()} {...extra} />)
    expect(screen.getByText(/box 求解器没有卸货约束/)).toBeInTheDocument()
    expect(screen.queryByTestId('upright-note')).not.toBeInTheDocument()
    rerender(<SettingsPanel project={stacked} solving={false} onChange={onChange} onSolve={vi.fn()} {...extra} />)
    expect(screen.getByTestId('upright-note')).toBeInTheDocument()
    pickOption(3, '各组沿 x 分段（门在 x 最大端）')
    expect(onChange).toHaveBeenCalledWith({ unloadingConstraint: 'increasing-x' })
  })
})

describe('SettingsPanel time budget', () => {
  it('shows the recommendation in automatic mode and opens manual mode pre-filled with it', () => {
    const onChange = vi.fn()
    render(<SettingsPanel project={demoProject()} solving={false} onChange={onChange} onSolve={vi.fn()} recommendation={budget} calibration={noCalibration} onResetCalibration={vi.fn()} />)
    expect(screen.getByTestId('recommendation').textContent).toContain('预计首解 2.7 s，上限 21 s；9.2 s 无改进即停（不早于 10.5 s）')
    expect(screen.getByTestId('recommendation').textContent).toContain('SOR')
    expect(screen.queryByTestId('manual-time')).toBeNull()
    fireEvent.click(screen.getByText('手动设置'))
    expect(onChange).toHaveBeenCalledWith({ timeMode: 'manual', timeLimit: 21, stopWhenUnimprovedFor: 9.2, stopWhenUnimprovedAfter: 10.5 })
    fireEvent.click(screen.getByText('更充分'))
    expect(onChange).toHaveBeenCalledWith({ alpha: 8 })
    const thorough = { ...demoProject(), settings: { ...demoProject().settings, alpha: 8 } }
    render(<SettingsPanel project={thorough} solving={false} onChange={onChange} onSolve={vi.fn()} recommendation={budget} calibration={noCalibration} onResetCalibration={vi.fn()} />)
    fireEvent.click(screen.getAllByText('默认（box 均衡，boxstacks 更充分）')[1])
    expect(onChange).toHaveBeenCalledWith({ alpha: undefined })
  })

  it('switches to manual without a recommendation and back to automatic', () => {
    const onChange = vi.fn()
    render(<SettingsPanel project={demoProject()} solving={false} onChange={onChange} onSolve={vi.fn()} {...extra} />)
    expect(screen.getByTestId('recommendation').textContent).toContain('正在估算')
    fireEvent.click(screen.getByText('手动设置'))
    expect(onChange).toHaveBeenCalledWith({ timeMode: 'manual' })
    const manual = { ...demoProject(), settings: { ...demoProject().settings, timeMode: 'manual' as const, timeLimit: 30 } }
    const { rerender } = render(<SettingsPanel project={manual} solving={false} onChange={onChange} onSolve={vi.fn()} {...extra} />)
    fireEvent.click(screen.getAllByText('自动（推荐）')[1])
    expect(onChange).toHaveBeenCalledWith({ timeMode: 'auto' })
    rerender(<SettingsPanel project={{ ...manual, items: [] }} solving={false} onChange={onChange} onSolve={vi.fn()} {...extra} />)
    expect(screen.getAllByTestId('recommendation')[1].textContent).toContain('无法估算')
  })

  it('edits the manual fields, restores the recommendation and explains the empty stall stop', () => {
    const onChange = vi.fn()
    const manual = { ...demoProject(), settings: { ...demoProject().settings, timeMode: 'manual' as const, timeLimit: 30, stopWhenUnimprovedFor: 5 } }
    render(<SettingsPanel project={manual} solving={false} onChange={onChange} onSolve={vi.fn()} recommendation={budget} calibration={noCalibration} onResetCalibration={vi.fn()} />)
    expect(screen.getByTestId('manual-time')).toBeInTheDocument()
    fireEvent.change(numberInput('time-limit'), { target: { value: '45' } })
    expect(onChange).toHaveBeenCalledWith({ timeLimit: 45 })
    fireEvent.change(numberInput('stop-for'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ stopWhenUnimprovedFor: undefined })
    fireEvent.change(numberInput('stop-after'), { target: { value: '3' } })
    expect(onChange).toHaveBeenCalledWith({ stopWhenUnimprovedAfter: 3 })
    fireEvent.click(screen.getByTestId('use-recommended'))
    expect(onChange).toHaveBeenCalledWith({ timeLimit: 21, stopWhenUnimprovedFor: 9.2, stopWhenUnimprovedAfter: 10.5 })
    expect(screen.getByText(/留空则只按时间上限结束/)).toBeInTheDocument()
  })

  it('warns about the slow multi-bin boxstacks path and the 600 s cap, and shows the calibration', () => {
    const onReset = vi.fn()
    const svc = { ...budget, path: 'SVC', timeLimit: 600, stopWhenUnimprovedFor: null, stopWhenUnimprovedAfter: null }
    render(<SettingsPanel project={demoProject()} solving={false} onChange={vi.fn()} onSolve={vi.fn()} recommendation={svc} calibration={{ speed: 1.37, samples: 3 }} onResetCalibration={onReset} />)
    expect(screen.getByTestId('svc-warning')).toBeInTheDocument()
    expect(screen.getByTestId('cap-warning')).toBeInTheDocument()
    expect(screen.getByTestId('calibration').textContent).toContain('机器速度系数 1.37（已校准 3 次）')
    fireEvent.click(screen.getByText('重置'))
    expect(onReset).toHaveBeenCalled()
    const box = { ...demoProject(), settings: { ...demoProject().settings, solver: 'box' as const } }
    render(<SettingsPanel project={box} solving={false} onChange={vi.fn()} onSolve={vi.fn()} recommendation={{ ...svc, timeLimit: 30 }} calibration={noCalibration} onResetCalibration={vi.fn()} />)
    expect(screen.getAllByTestId('svc-warning')).toHaveLength(1)
    expect(screen.getAllByTestId('cap-warning')).toHaveLength(1)
    expect(screen.getAllByTestId('calibration')[1].textContent).toContain('尚未校准')
  })
})
