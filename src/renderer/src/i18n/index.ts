import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enUS from './en-US.json'
import jaJP from './ja-JP.json'
import zhCN from './zh-CN.json'

export const resources = { 'zh-CN': { translation: zhCN }, 'en-US': { translation: enUS }, 'ja-JP': { translation: jaJP } } as const

export type Language = keyof typeof resources
export const LANGUAGES = Object.keys(resources) as Language[]
/** Which `name` / `note` key of a preset entry each interface language reads. */
export const PRESET_LANGUAGE: Record<Language, 'zh' | 'en' | 'ja'> = { 'zh-CN': 'zh', 'en-US': 'en', 'ja-JP': 'ja' }

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && value in resources
}

export function setupI18n(language: Language = 'zh-CN'): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({ resources, lng: language, fallbackLng: 'zh-CN', interpolation: { escapeValue: false } })
  } else if (i18n.language !== language) {
    void i18n.changeLanguage(language)
  }
  return i18n
}

export default i18n
