import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enUS from './en-US.json'
import zhCN from './zh-CN.json'

export const resources = { 'zh-CN': { translation: zhCN }, 'en-US': { translation: enUS } } as const

export function setupI18n(language: 'zh-CN' | 'en-US' = 'zh-CN'): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({ resources, lng: language, fallbackLng: 'zh-CN', interpolation: { escapeValue: false } })
  } else if (i18n.language !== language) {
    void i18n.changeLanguage(language)
  }
  return i18n
}

export default i18n
