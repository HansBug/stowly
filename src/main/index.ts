import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { locatePython } from './backend'
import { BackendProcess } from './process'

const projectRoot = path.resolve(__dirname, '..', '..')
let backend: BackendProcess | null = null
let startupError: string | null = null

async function startBackend(): Promise<void> {
  const location = locatePython({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, projectRoot, platform: process.platform, env: process.env })
  backend = new BackendProcess(location)
  try {
    await backend.start()
  } catch (err) {
    startupError = err instanceof Error ? err.message : String(err)
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Stowly',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: false, nodeIntegration: false }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('backend:info', () => ({ ...(backend?.current ?? null), error: startupError, log: backend?.log.slice(-50) ?? [] }))
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('shell:openExternal', (_event, url: string) => shell.openExternal(url))
ipcMain.handle('dialog:saveText', async (_event, options: { defaultPath: string; filters: Electron.FileFilter[]; content: string }) => {
  const result = await dialog.showSaveDialog({ defaultPath: options.defaultPath, filters: options.filters })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, options.content, 'utf-8')
  return result.filePath
})
ipcMain.handle('dialog:openFiles', async (_event, options: { filters: Electron.FileFilter[]; multiple?: boolean }) => {
  const result = await dialog.showOpenDialog({ filters: options.filters, properties: options.multiple ? ['openFile', 'multiSelections'] : ['openFile'] })
  if (result.canceled) return []
  return Promise.all(result.filePaths.map(async (filePath) => ({ name: path.basename(filePath), path: filePath, data: (await readFile(filePath)).buffer })))
})

app.whenReady().then(async () => {
  await startBackend()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('will-quit', () => backend?.stop())
