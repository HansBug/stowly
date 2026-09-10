/** IPC handlers of the main process, kept free of Electron globals so they can be tested with plain objects. */
import type { FileFilter, IpcMainInvokeEvent } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BackendInfo } from './backend'

export interface IpcDeps {
  dialog: {
    showSaveDialog: (options: { defaultPath?: string; filters?: FileFilter[] }) => Promise<{ canceled: boolean; filePath?: string }>
    showOpenDialog: (options: { filters?: FileFilter[]; properties?: Array<'openFile' | 'multiSelections'> }) => Promise<{ canceled: boolean; filePaths: string[] }>
  }
  shell: { openExternal: (url: string) => Promise<void> }
  version: () => string
  backend: () => { info: BackendInfo | null; error: string | null; log: string[] }
}

export type Handler = (event: IpcMainInvokeEvent | undefined, ...args: never[]) => unknown

export function createHandlers(deps: IpcDeps) {
  return {
    'backend:info': () => {
      const b = deps.backend()
      return { ...(b.info ?? null), error: b.error, log: b.log.slice(-50) }
    },
    'app:version': () => deps.version(),
    'shell:openExternal': (_event: unknown, url: string) => deps.shell.openExternal(url),
    'dialog:saveText': async (_event: unknown, options: { defaultPath: string; filters: FileFilter[]; content: string }) => {
      const result = await deps.dialog.showSaveDialog({ defaultPath: options.defaultPath, filters: options.filters })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, options.content, 'utf-8')
      return result.filePath
    },
    'dialog:openFiles': async (_event: unknown, options: { filters: FileFilter[]; multiple?: boolean }) => {
      const properties: Array<'openFile' | 'multiSelections'> = options.multiple ? ['openFile', 'multiSelections'] : ['openFile']
      const result = await deps.dialog.showOpenDialog({ filters: options.filters, properties })
      if (result.canceled) return []
      return Promise.all(result.filePaths.map(async (filePath) => {
        const bytes = await readFile(filePath)
        // Copy out of Node's buffer pool: `.buffer` alone may be a shared slab larger than the file.
        return { name: path.basename(filePath), path: filePath, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
      }))
    }
  }
}

export type Handlers = ReturnType<typeof createHandlers>

export function registerIpc(ipcMain: { handle: (channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) => void }, handlers: Handlers): void {
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler as (event: IpcMainInvokeEvent, ...args: any[]) => unknown)
}
