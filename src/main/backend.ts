/**
 * Pure helpers for the Python backend: where the interpreter is and how its READY line is parsed. The process itself lives in process.ts.
 *
 * In development the interpreter is `.venv/bin/python` of the checkout (or STOWLY_PYTHON) with backend/ on PYTHONPATH;
 * in a packaged app it is the relocatable CPython that scripts/prepare-python.mjs placed under resources/python, where the
 * backend and packingsolver3d are installed as normal packages.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

export interface BackendInfo {
  baseUrl: string
  token: string
}

/** Parse the single `READY {"host": ..., "port": ...}` line the backend prints once it has picked a port. */
export function parseReadyLine(line: string): { host: string; port: number } | null {
  const match = /^READY\s+(\{.*\})\s*$/.exec(line.trim())
  if (!match) return null
  try {
    const payload = JSON.parse(match[1]) as { host?: string; port?: number }
    if (typeof payload.port !== 'number') return null
    return { host: payload.host || '127.0.0.1', port: payload.port }
  } catch {
    return null
  }
}

export interface PythonLocation {
  command: string
  /** Arguments placed before `-m stowly_backend`; tests use them to run a fake interpreter through node. */
  args?: string[]
  env: NodeJS.ProcessEnv
}

/** Decide which interpreter runs the backend. Exported for tests; pure apart from existsSync. */
export function locatePython(opts: { packaged: boolean; resourcesPath: string; projectRoot: string; platform: NodeJS.Platform; env: NodeJS.ProcessEnv; exists?: (p: string) => boolean }): PythonLocation {
  const exists = opts.exists ?? existsSync
  // Paths follow the target platform, not the host, so the decision is the same everywhere (and so are the tests).
  const join = (opts.platform === 'win32' ? path.win32 : path.posix).join
  const env: NodeJS.ProcessEnv = { ...opts.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
  if (opts.env.STOWLY_PYTHON) return { command: opts.env.STOWLY_PYTHON, env: { ...env, PYTHONPATH: join(opts.projectRoot, 'backend') } }
  if (opts.packaged) {
    // Packaged builds never fall back to a system interpreter: a missing bundle must fail loudly, not run on whatever is installed.
    const bundled = opts.platform === 'win32' ? join(opts.resourcesPath, 'python', 'python.exe') : join(opts.resourcesPath, 'python', 'bin', 'python3')
    return { command: bundled, env }
  }
  const venv = opts.platform === 'win32' ? join(opts.projectRoot, '.venv', 'Scripts', 'python.exe') : join(opts.projectRoot, '.venv', 'bin', 'python')
  const command = exists(venv) ? venv : opts.platform === 'win32' ? 'python' : 'python3'
  return { command, env: { ...env, PYTHONPATH: join(opts.projectRoot, 'backend') } }
}
