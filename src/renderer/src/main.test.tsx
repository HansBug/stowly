import { waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import i18n from './i18n'

vi.mock('./App', () => ({ App: () => <div data-testid="app">app</div> }))

describe('renderer entry', () => {
  it('mounts the app with the remembered language', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    localStorage.setItem('stowly.language', 'en-US')
    await import('./main')
    await waitFor(() => expect(document.querySelector('[data-testid=app]')).not.toBeNull())
    expect(i18n.language).toBe('en-US')
    localStorage.removeItem('stowly.language')
  })
})
