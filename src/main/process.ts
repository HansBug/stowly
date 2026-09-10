/** The Python backend as a child process: start `python -m stowly_backend`, wait for its READY line, stop it on quit. */
import { spawn, ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { parseReadyLine, type BackendInfo, type PythonLocation } from './backend'

export class BackendProcess {
  private child: ChildProcess | null = null
  private info: BackendInfo | null = null
  readonly log: string[] = []

  constructor(private readonly location: PythonLocation) {}

  get current(): BackendInfo | null {
    return this.info
  }

  /** Start the backend and resolve once it announces its port (or reject after `timeoutMs`). */
  start(timeoutMs = 30000): Promise<BackendInfo> {
    const token = randomBytes(16).toString('hex')
    return new Promise((resolve, reject) => {
      const child = spawn(this.location.command, [...(this.location.args ?? []), '-m', 'stowly_backend', '--port', '0', '--token', token], { env: this.location.env, stdio: ['ignore', 'pipe', 'pipe'] })
      this.child = child
      let settled = false
      let buffer = ''
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error(`backend did not start within ${timeoutMs} ms\n${this.log.slice(-20).join('\n')}`))
        }
      }, timeoutMs)
      child.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8')
        let index: number
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index)
          buffer = buffer.slice(index + 1)
          this.remember(line)
          const ready = parseReadyLine(line)
          if (ready && !settled) {
            settled = true
            clearTimeout(timer)
            this.info = { baseUrl: `http://${ready.host}:${ready.port}`, token }
            resolve(this.info)
          }
        }
      })
      child.stderr?.on('data', (chunk: Buffer) => this.remember(chunk.toString('utf-8').trimEnd()))
      child.on('error', (err) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(new Error(`cannot start ${this.location.command}: ${err.message}`))
        }
      })
      child.on('exit', (code) => {
        this.remember(`backend exited with code ${code}`)
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(new Error(`backend exited with code ${code}\n${this.log.slice(-20).join('\n')}`))
        }
      })
    })
  }

  stop(): void {
    if (this.child && !this.child.killed) this.child.kill()
    this.child = null
  }

  private remember(line: string): void {
    if (!line) return
    this.log.push(line)
    if (this.log.length > 500) this.log.splice(0, this.log.length - 500)
  }
}
