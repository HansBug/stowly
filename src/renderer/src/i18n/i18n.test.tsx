import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import i18n, { isLanguage, LANGUAGES, setupI18n } from './index'
import { SettingsPanel } from '../components/SettingsPanel'
import { demoProject } from '../lib/project'

describe('i18n', () => {
  it('defaults to Chinese and can switch to English', async () => {
    setupI18n('zh-CN')
    expect(i18n.t('settings.solve')).toBe('开始求解')
    const { rerender } = render(<SettingsPanel project={demoProject()} solving={false} onChange={() => undefined} onSolve={() => undefined} recommendation={null} calibration={{ speed: 1, samples: 0 }} onResetCalibration={() => undefined} />)
    expect(screen.getByTestId('solve-button').textContent).toContain('开始求解')
    await i18n.changeLanguage('en-US')
    rerender(<SettingsPanel project={demoProject()} solving={false} onChange={() => undefined} onSolve={() => undefined} recommendation={null} calibration={{ speed: 1, samples: 0 }} onResetCalibration={() => undefined} />)
    expect(screen.getByTestId('solve-button').textContent).toContain('Solve')
    await i18n.changeLanguage('zh-CN')
  })
  it('switches an already initialised instance', () => {
    setupI18n('en-US')
    expect(i18n.language).toBe('en-US')
    setupI18n('ja-JP')
    expect(i18n.t('settings.solve')).toBe('求解開始')
    setupI18n('zh-CN')
    expect(i18n.language).toBe('zh-CN')
    expect(LANGUAGES).toEqual(['zh-CN', 'en-US', 'ja-JP'])
    expect(isLanguage('ja-JP')).toBe(true)
    expect(isLanguage('fr-FR')).toBe(false)
    expect(isLanguage(null)).toBe(false)
  })
  it('has the same keys in every language', () => {
    const flatten = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) => (typeof value === 'object' && value !== null ? flatten(value as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]))
    const zh = flatten(i18n.getResourceBundle('zh-CN', 'translation')).sort()
    for (const language of LANGUAGES) expect(flatten(i18n.getResourceBundle(language, 'translation')).sort(), language).toEqual(zh)
  })
})
