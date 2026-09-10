// @vitest-environment node
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createHandlers, registerIpc } from './ipc'

function deps(overrides: Partial<Parameters<typeof createHandlers>[0]> = {}) {
  return {
    dialog: { showSaveDialog: vi.fn(async () => ({ canceled: true })), showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
    shell: { openExternal: vi.fn(async () => undefined) },
    version: () => '9.9.9',
    backend: () => ({ info: { baseUrl: 'http://127.0.0.1:1', token: 't' }, error: null, log: Array.from({ length: 60 }, (_, i) => `line ${i}`) }),
    ...overrides
  }
}

describe('ipc handlers', () => {
  it('reports backend info with the tail of the log, the version and opens links', async () => {
    const d = deps()
    const h = createHandlers(d)
    const info = h['backend:info']()
    expect(info.baseUrl).toBe('http://127.0.0.1:1')
    expect(info.log).toHaveLength(50)
    expect(info.log[0]).toBe('line 10')
    expect(createHandlers(deps({ backend: () => ({ info: null, error: 'boom', log: [] }) }))['backend:info']()).toEqual({ error: 'boom', log: [] })
    expect(h['app:version']()).toBe('9.9.9')
    await h['shell:openExternal'](undefined, 'https://example.org')
    expect(d.shell.openExternal).toHaveBeenCalledWith('https://example.org')
  })
  it('writes text where the save dialog points and returns null when cancelled', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stowly-ipc-'))
    const target = path.join(dir, 'p.json')
    const d = deps({ dialog: { showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })), showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) } })
    const h = createHandlers(d)
    expect(await h['dialog:saveText'](undefined, { defaultPath: 'p.json', filters: [], content: '{"a":1}' })).toBe(target)
    expect(await readFile(target, 'utf-8')).toBe('{"a":1}')
    expect(await createHandlers(deps())['dialog:saveText'](undefined, { defaultPath: 'p.json', filters: [], content: 'x' })).toBeNull()
  })
  it('reads the picked files as exact-size ArrayBuffers', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stowly-ipc-'))
    const file = path.join(dir, 'cargo.csv')
    await writeFile(file, 'name,x\nA,1\n')
    const d = deps({ dialog: { showSaveDialog: vi.fn(async () => ({ canceled: true })), showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [file] })) } })
    const h = createHandlers(d)
    const files = await h['dialog:openFiles'](undefined, { filters: [], multiple: true })
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('cargo.csv')
    expect(new TextDecoder().decode(files[0].data)).toBe('name,x\nA,1\n')
    expect(d.dialog.showOpenDialog).toHaveBeenCalledWith({ filters: [], properties: ['openFile', 'multiSelections'] })
    await h['dialog:openFiles'](undefined, { filters: [] })
    expect(d.dialog.showOpenDialog).toHaveBeenLastCalledWith({ filters: [], properties: ['openFile'] })
    expect(await createHandlers(deps())['dialog:openFiles'](undefined, { filters: [] })).toEqual([])
  })
  it('registers every channel', () => {
    const handle = vi.fn()
    registerIpc({ handle }, createHandlers(deps()))
    expect(handle.mock.calls.map((c) => c[0]).sort()).toEqual(['app:version', 'backend:info', 'dialog:openFiles', 'dialog:saveText', 'shell:openExternal'])
  })
})
