import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { isLanguage, setupI18n } from './i18n'
import './styles.css'

const saved = localStorage.getItem('stowly.language')
setupI18n(isLanguage(saved) ? saved : 'zh-CN')
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
