// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ contextBridge: { exposeInMainWorld: vi.fn() }, ipcRenderer: { invoke: vi.fn(async (channel: string) => `answer:${channel}`) } }))
vi.mock('electron', () => electron)

describe('preload bridge', () => {
  it('exposes window.stowly and forwards every call over IPC', async () => {
    await import('./index')
    expect(electron.contextBridge.exposeInMainWorld).toHaveBeenCalledWith('stowly', expect.any(Object))
    const api = electron.contextBridge.exposeInMainWorld.mock.calls[0][1] as Record<string, (...args: unknown[]) => Promise<unknown>>
    expect(await api.backendInfo()).toBe('answer:backend:info')
    expect(await api.appVersion()).toBe('answer:app:version')
    await api.openExternal('https://x')
    await api.saveText('a.json', [{ name: 'JSON', extensions: ['json'] }], '{}')
    await api.openFiles([{ name: 'CSV', extensions: ['csv'] }])
    await api.openFiles([], true)
    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['backend:info'], ['app:version'], ['shell:openExternal', 'https://x'],
      ['dialog:saveText', { defaultPath: 'a.json', filters: [{ name: 'JSON', extensions: ['json'] }], content: '{}' }],
      ['dialog:openFiles', { filters: [{ name: 'CSV', extensions: ['csv'] }], multiple: false }],
      ['dialog:openFiles', { filters: [], multiple: true }]
    ])
  })
})
