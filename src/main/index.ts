import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { locatePython, type PythonLocation } from './backend'
import { createHandlers, registerIpc } from './ipc'
import { BackendProcess } from './process'
import { smokeTest } from './smoke'

const projectRoot = path.resolve(__dirname, '..', '..')
let location: PythonLocation | null = null
let backend: BackendProcess | null = null
let startupError: string | null = null

async function startBackend(): Promise<void> {
  location = locatePython({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, projectRoot, platform: process.platform, env: process.env })
  backend = new BackendProcess(location)
  try {
    await backend.start()
  } catch (err) {
    startupError = err instanceof Error ? err.message : String(err)
  }
}

function createWindow(): BrowserWindow {
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
  return win
}

/** `--smoke` or `--smoke=/path/report.json`: run the self-test and exit with its verdict. */
export function smokeReportPath(argv: string[]): string | null {
  const flag = argv.find((arg) => arg === '--smoke' || arg.startsWith('--smoke='))
  if (!flag) return null
  return flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : path.join(process.cwd(), 'stowly-smoke.json')
}

/** True once the renderer has drawn the app and enabled the preset buttons, which only happens after it fetched the presets. */
export async function rendererReady(win: Pick<BrowserWindow, 'webContents'>, timeoutMs = 60000, sleepMs = 500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  const probe = `(() => { const buttons = [...document.querySelectorAll('button')]; return document.body.innerText.includes('Stowly') && buttons.some((b) => /预设|preset/i.test(b.textContent || '') && !b.disabled) })()`
  while (Date.now() < deadline) {
    if (!win.webContents.isLoading() && (await win.webContents.executeJavaScript(probe)) === true) return true
    await new Promise((resolve) => setTimeout(resolve, sleepMs))
  }
  return false
}

registerIpc(ipcMain, createHandlers({
  // Electron's dialog methods are overloaded (optional parent window); the plain-options form is all the handlers need.
  dialog: { showSaveDialog: (options) => dialog.showSaveDialog(options), showOpenDialog: (options) => dialog.showOpenDialog(options) },
  shell,
  version: () => app.getVersion(),
  backend: () => ({ info: backend?.current ?? null, error: startupError, log: backend?.log ?? [] })
}))

app.whenReady().then(async () => {
  await startBackend()
  const win = createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  const reportPath = smokeReportPath(process.argv)
  if (reportPath) {
    const report = await smokeTest({ info: backend?.current ?? null, startupError, log: backend?.log ?? [], location: location!, renderer: () => rendererReady(win) })
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8')
    console.log(`SMOKE ${report.ok ? 'OK' : 'FAILED'} ${reportPath}`)
    backend?.stop()
    app.exit(report.ok ? 0 : 1)
  }
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('will-quit', () => backend?.stop())
