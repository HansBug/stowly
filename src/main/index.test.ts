// @vitest-environment node
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => {
  const listeners: Record<string, (...args: unknown[]) => unknown> = {}
  const handlers: Record<string, (...args: unknown[]) => unknown> = {}
  const webContents = { setWindowOpenHandler: vi.fn(), isLoading: vi.fn(() => false), executeJavaScript: vi.fn(async () => true) }
  const win = { loadFile: vi.fn(), loadURL: vi.fn(), webContents }
  const BrowserWindow = Object.assign(vi.fn(function () { return win }), { getAllWindows: vi.fn(() => []) })
  const app = { isPackaged: false, whenReady: vi.fn(() => Promise.resolve()), on: vi.fn((name: string, fn: (...args: unknown[]) => unknown) => { listeners[name] = fn }), quit: vi.fn(), exit: vi.fn(), getVersion: () => '0.1.0' }
  return { listeners, handlers, win, BrowserWindow, app, shell: { openExternal: vi.fn(async () => undefined) }, dialog: {}, ipcMain: { handle: vi.fn((c: string, h: (...args: unknown[]) => unknown) => { handlers[c] = h }) } }
})
vi.mock('electron', () => electron)

const backend = vi.hoisted(() => ({ startResult: null as Error | null, stop: vi.fn(), started: 0 }))
vi.mock('./process', () => ({
  BackendProcess: class {
    log = ['booted']
    current: { baseUrl: string; token: string } | null = null
    async start() {
      backend.started++
      if (backend.startResult) throw backend.startResult
      this.current = { baseUrl: 'http://127.0.0.1:5', token: 'tok' }
      return this.current
    }
    stop = backend.stop
  }
}))

const flush = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('main process entry', () => {
  const argv = process.argv
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); backend.startResult = null; process.argv = ['electron', '.'] })
  afterEach(() => { process.argv = argv; delete process.env.ELECTRON_RENDERER_URL })

  it('starts the backend, opens the window and wires IPC and lifecycle', async () => {
    await import('./index')
    await flush()
    expect(backend.started).toBe(1)
    expect(electron.BrowserWindow).toHaveBeenCalledOnce()
    expect(electron.win.loadFile).toHaveBeenCalledWith(expect.stringContaining(path.join('renderer', 'index.html')))
    expect(Object.keys(electron.handlers).sort()).toEqual(['app:version', 'backend:info', 'dialog:openFiles', 'dialog:saveText', 'shell:openExternal'])
    expect(electron.handlers['backend:info']()).toMatchObject({ baseUrl: 'http://127.0.0.1:5', token: 'tok', error: null, log: ['booted'] })
    expect(electron.handlers['app:version']()).toBe('0.1.0')
    // popups go to the system browser
    const opener = electron.win.webContents.setWindowOpenHandler.mock.calls[0][0] as (d: { url: string }) => { action: string }
    expect(opener({ url: 'https://example.org' })).toEqual({ action: 'deny' })
    expect(electron.shell.openExternal).toHaveBeenCalledWith('https://example.org')
    // lifecycle
    electron.listeners['activate']()
    expect(electron.BrowserWindow).toHaveBeenCalledTimes(2)
    electron.listeners['window-all-closed']()
    expect(electron.app.quit).toHaveBeenCalledTimes(process.platform === 'darwin' ? 0 : 1)
    electron.listeners['will-quit']()
    expect(backend.stop).toHaveBeenCalled()
  })
  it('loads the dev server URL when electron-vite provides one and reports a failed backend start', async () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
    backend.startResult = new Error('no interpreter')
    await import('./index')
    await flush()
    expect(electron.win.loadURL).toHaveBeenCalledWith('http://localhost:5173')
    expect(electron.handlers['backend:info']()).toMatchObject({ error: 'no interpreter' })
  })
  it('runs the smoke test when asked and exits with its verdict', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stowly-smoke-'))
    const report = path.join(dir, 'report.json')
    process.argv = ['stowly', `--smoke=${report}`]
    vi.doMock('./smoke', () => ({ smokeTest: vi.fn(async (opts: { renderer: () => Promise<boolean> }) => ({ ok: await opts.renderer(), errors: [] })) }))
    const { smokeReportPath } = await import('./index')
    await flush()
    expect(JSON.parse(await readFile(report, 'utf-8'))).toEqual({ ok: true, errors: [] })
    expect(electron.app.exit).toHaveBeenCalledWith(0)
    expect(electron.win.webContents.executeJavaScript).toHaveBeenCalled()
    expect(smokeReportPath(['--smoke'])).toBe(path.join(process.cwd(), 'stowly-smoke.json'))
    expect(smokeReportPath(['--other'])).toBeNull()
  })
  it('exits non-zero when the smoke test fails, and gives up on a renderer that never settles', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stowly-smoke-'))
    process.argv = ['stowly', `--smoke=${path.join(dir, 'r.json')}`]
    vi.doMock('./smoke', () => ({ smokeTest: vi.fn(async () => ({ ok: false, errors: ['renderer'] })) }))
    const { rendererReady } = await import('./index')
    await flush()
    expect(electron.app.exit).toHaveBeenCalledWith(1)
    const loading = { webContents: { isLoading: () => true, executeJavaScript: vi.fn(async () => true) } }
    expect(await rendererReady(loading as never, 5, 1)).toBe(false)
    const blank = { webContents: { isLoading: () => false, executeJavaScript: vi.fn(async () => false) } }
    expect(await rendererReady(blank as never, 5, 1)).toBe(false)
    const ready = { webContents: { isLoading: () => false, executeJavaScript: vi.fn(async () => true) } }
    expect(await rendererReady(ready as never, 5, 1)).toBe(true)
  })
})
