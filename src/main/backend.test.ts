import { describe, expect, it } from 'vitest'
import { locatePython, parseReadyLine } from './backend'

describe('parseReadyLine', () => {
  it('reads the announced port', () => {
    expect(parseReadyLine('READY {"host": "127.0.0.1", "port": 43210}')).toEqual({ host: '127.0.0.1', port: 43210 })
  })
  it('ignores other lines and malformed payloads', () => {
    expect(parseReadyLine('INFO: started')).toBeNull()
    expect(parseReadyLine('READY {not json}')).toBeNull()
    expect(parseReadyLine('READY {"host": "x"}')).toBeNull()
  })
})

describe('locatePython', () => {
  const base = { resourcesPath: '/app/resources', projectRoot: '/src', env: {} as NodeJS.ProcessEnv }
  it('prefers STOWLY_PYTHON', () => {
    const loc = locatePython({ ...base, packaged: true, platform: 'linux', env: { STOWLY_PYTHON: '/opt/py/bin/python' } })
    expect(loc.command).toBe('/opt/py/bin/python')
    expect(loc.env.PYTHONPATH).toBe('/src/backend')
  })
  it('uses the bundled interpreter when packaged', () => {
    expect(locatePython({ ...base, packaged: true, platform: 'linux' }).command).toBe('/app/resources/python/bin/python3')
    expect(locatePython({ ...base, packaged: true, platform: 'win32' }).command).toBe('/app/resources/python/python.exe'.replace(/\//g, process.platform === 'win32' ? '\\' : '/'))
  })
  it('falls back from the venv to the system interpreter in development', () => {
    expect(locatePython({ ...base, packaged: false, platform: 'linux', exists: () => true }).command).toBe('/src/.venv/bin/python')
    expect(locatePython({ ...base, packaged: false, platform: 'linux', exists: () => false }).command).toBe('python3')
    expect(locatePython({ ...base, packaged: false, platform: 'win32', exists: () => false }).command).toBe('python')
  })
})
