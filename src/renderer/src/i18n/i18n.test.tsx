import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import i18n, { setupI18n } from './index'
import { SettingsPanel } from '../components/SettingsPanel'
import { demoProject } from '../lib/project'

describe('i18n', () => {
  it('defaults to Chinese and can switch to English', async () => {
    setupI18n('zh-CN')
    expect(i18n.t('settings.solve')).toBe('开始求解')
    const { rerender } = render(<SettingsPanel project={demoProject()} solving={false} onChange={() => undefined} onSolve={() => undefined} />)
    expect(screen.getByTestId('solve-button').textContent).toContain('开始求解')
    await i18n.changeLanguage('en-US')
    rerender(<SettingsPanel project={demoProject()} solving={false} onChange={() => undefined} onSolve={() => undefined} />)
    expect(screen.getByTestId('solve-button').textContent).toContain('Solve')
    await i18n.changeLanguage('zh-CN')
  })
  it('switches an already initialised instance', () => {
    setupI18n('en-US')
    expect(i18n.language).toBe('en-US')
    setupI18n('zh-CN')
    expect(i18n.language).toBe('zh-CN')
  })
  it('has the same keys in both languages', () => {
    const flatten = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) => (typeof value === 'object' && value !== null ? flatten(value as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]))
    const zh = flatten(i18n.getResourceBundle('zh-CN', 'translation'))
    const en = flatten(i18n.getResourceBundle('en-US', 'translation'))
    expect(en.sort()).toEqual(zh.sort())
  })
})
