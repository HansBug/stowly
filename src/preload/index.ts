import { contextBridge, ipcRenderer } from 'electron'

const api = {
  backendInfo: (): Promise<{ baseUrl?: string; token?: string; error: string | null; log: string[] }> => ipcRenderer.invoke('backend:info'),
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  saveText: (defaultPath: string, filters: { name: string; extensions: string[] }[], content: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveText', { defaultPath, filters, content }),
  openFiles: (filters: { name: string; extensions: string[] }[], multiple = false): Promise<{ name: string; path: string; data: ArrayBuffer }[]> =>
    ipcRenderer.invoke('dialog:openFiles', { filters, multiple })
}

contextBridge.exposeInMainWorld('stowly', api)

export type StowlyApi = typeof api
