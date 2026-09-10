import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { setupI18n } from '../i18n'
import { pickOption } from '../test/fixtures'
import { ImportModal } from './ImportModal'

setupI18n('zh-CN')

describe('ImportModal', () => {
  it('collects the unit and instance index before opening the file dialog', async () => {
    const onPick = vi.fn(async () => undefined)
    const onCancel = vi.fn()
    render(<ImportModal open defaultUnit="mm" onCancel={onCancel} onPick={onPick} />)
    pickOption(0, 'cm')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }))
    await waitFor(() => expect(onPick).toHaveBeenCalledWith('cm', 3))
    fireEvent.click(screen.getByRole('button', { name: /取\s*消/ }))
    expect(onCancel).toHaveBeenCalled()
  })
})
