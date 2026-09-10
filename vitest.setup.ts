import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// Rendering the whole Ant Design shell in jsdom takes a second or two; give waitFor room.
configure({ asyncUtilTimeout: 15000 })

// antd measures layout through matchMedia and ResizeObserver, which jsdom lacks. Main-process tests run in the node environment and have no window.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as MediaQueryList
}
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
}
