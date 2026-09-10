import type { StowlyApi } from './index'

declare global {
  interface Window {
    stowly?: StowlyApi
  }
}

export {}
