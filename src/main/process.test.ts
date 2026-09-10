// @vitest-environment node
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BackendProcess } from './process'

const fake = (mode: string) => ({ command: process.execPath, args: [path.join(__dirname, '__fixtures__', 'fake-python.cjs')], env: { ...process.env, FAKE_MODE: mode } })
let running: BackendProcess | null = null
afterEach(() => running?.stop())

describe('BackendProcess', () => {
  it('resolves on the READY line and keeps the log', async () => {
    running = new BackendProcess(fake('ready'))
    expect(running.current).toBeNull()
    const info = await running.start(10000)
    expect(info.baseUrl).toBe('http://127.0.0.1:43210')
    expect(info.token).toMatch(/^[0-9a-f]{32}$/)
    expect(running.current).toEqual(info)
    expect(running.log).toContain('noise before the handshake')
    expect(running.log.some((line) => line.includes('INFO: warming up'))).toBe(true)
    running.stop()
    running.stop() // idempotent
  })
  it('rejects when the interpreter exits before announcing a port', async () => {
    running = new BackendProcess(fake('exit'))
    await expect(running.start(10000)).rejects.toThrow(/exited with code 3/)
  })
  it('rejects when nothing is announced in time', async () => {
    running = new BackendProcess(fake('silent'))
    await expect(running.start(300)).rejects.toThrow(/did not start within 300 ms/)
  })
  it('rejects when the interpreter cannot be spawned', async () => {
    running = new BackendProcess({ command: path.join(__dirname, 'no-such-python'), env: {} })
    await expect(running.start(10000)).rejects.toThrow(/cannot start/)
  })
})
