import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { setupI18n } from './i18n'
import './styles.css'

setupI18n((localStorage.getItem('stowly.language') as 'zh-CN' | 'en-US' | null) ?? 'zh-CN')
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
