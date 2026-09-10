import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { setupI18n } from '../i18n'
import { demoProject, emptyProject } from '../lib/project'
import { pickOption } from '../test/fixtures'
import { SettingsPanel } from './SettingsPanel'

setupI18n('zh-CN')

describe('SettingsPanel', () => {
  it('lists the problems of an empty project and disables solving', () => {
    render(<SettingsPanel project={emptyProject()} solving={false} onChange={vi.fn()} onSolve={vi.fn()} />)
    expect(screen.getByText(/至少需要一个容器/)).toBeInTheDocument()
    expect(screen.getByTestId('solve-button')).toBeDisabled()
  })

  it('reports the volume ratio and forwards every setting', () => {
    const onChange = vi.fn()
    const onSolve = vi.fn()
    render(<SettingsPanel project={demoProject()} solving={false} onChange={onChange} onSolve={onSolve} />)
    expect(screen.getByText(/货物总体积 81\.63 m³/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '30' } })
    expect(onChange).toHaveBeenCalledWith({ timeLimit: 30 })
    pickOption(0, 'boxstacks')
    expect(onChange).toHaveBeenCalledWith({ solver: 'boxstacks' })
    pickOption(1, '装箱：容器最少')
    expect(onChange).toHaveBeenCalledWith({ objective: 'bin-packing' })
    pickOption(2, '确定性（可复现）')
    expect(onChange).toHaveBeenCalledWith({ optimizationMode: 'not-anytime-deterministic' })
    fireEvent.click(screen.getByTestId('solve-button'))
    expect(onSolve).toHaveBeenCalled()
  })

  it('shows the running state', () => {
    render(<SettingsPanel project={demoProject()} solving onChange={vi.fn()} onSolve={vi.fn()} />)
    expect(screen.getByTestId('solve-button').textContent).toContain('求解中')
  })
})
