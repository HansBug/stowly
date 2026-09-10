import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

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

// antd's static message API renders into its own React root and auto-closes toasts on a 3 s timer. If a test ends first,
// that React work runs after jsdom is torn down and vitest reports an unhandled "window is not defined". Drop the toasts
// and let the scheduler flush after every jsdom test.
if (typeof window !== 'undefined') {
  afterEach(async () => {
    cleanup()
    const { message } = await import('antd')
    message.destroy()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}
