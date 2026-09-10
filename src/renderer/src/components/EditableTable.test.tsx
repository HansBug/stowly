import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { setupI18n } from '../i18n'
import { demoProject } from '../lib/project'
import { pickOption } from '../test/fixtures'
import { EditableTable } from './EditableTable'

setupI18n('zh-CN')

describe('EditableTable', () => {
  it('shows a hint when there is nothing to edit', () => {
    render(<EditableTable rows={[]} unit="mm" kind="bins" onChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/还没有容器/)).toBeInTheDocument()
  })

  it('edits containers in the project unit and removes them after confirmation', () => {
    const onChange = vi.fn()
    const onRemove = vi.fn()
    const bins = demoProject().bins
    render(<EditableTable rows={bins} unit="cm" kind="bins" onChange={onChange} onRemove={onRemove} />)
    fireEvent.change(screen.getByPlaceholderText('名称'), { target: { value: 'HC' } })
    expect(onChange).toHaveBeenCalledWith(bins[0].id, { name: 'HC' })
    const numbers = screen.getAllByRole('spinbutton')
    expect(numbers[0]).toHaveValue('1203.2')
    fireEvent.change(numbers[0], { target: { value: '1300' } })
    expect(onChange).toHaveBeenCalledWith(bins[0].id, { x: 13000 })
    fireEvent.change(numbers[3], { target: { value: '2' } })
    expect(onChange).toHaveBeenCalledWith(bins[0].id, { copies: 2 })
    fireEvent.change(numbers[4], { target: { value: '7' } })
    expect(onChange).toHaveBeenCalledWith(bins[0].id, { cost: 7 })
    fireEvent.change(numbers[5], { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(bins[0].id, { maxWeight: null })
    fireEvent.click(screen.getByRole('button', { name: /delete/ }))
    fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }))
    expect(onRemove).toHaveBeenCalledWith(bins[0].id)
  })

  it('edits cargo including weight, value and rotation', () => {
    const onChange = vi.fn()
    const items = demoProject().items.slice(0, 2)
    render(<EditableTable rows={items} unit="mm" kind="items" onChange={onChange} onRemove={vi.fn()} />)
    const numbers = screen.getAllByRole('spinbutton')
    fireEvent.change(numbers[4], { target: { value: '9.5' } })
    expect(onChange).toHaveBeenCalledWith(items[0].id, { weight: 9.5 })
    fireEvent.change(numbers[5], { target: { value: '3' } })
    expect(onChange).toHaveBeenCalledWith(items[0].id, { profit: 3 })
    fireEvent.change(numbers[5], { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(items[0].id, { profit: null })
    pickOption(0, '直立')
    expect(onChange).toHaveBeenCalledWith(items[0].id, { rotations: 'upright' })
  })
})
