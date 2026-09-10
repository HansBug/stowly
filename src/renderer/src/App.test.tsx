import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { setupI18n } from './i18n'
import { emptyProject, serializeProject } from './lib/project'
import { useStowly } from './store/project'
import { fakeFetch, pickOption, presets, solvedDemo } from './test/fixtures'

vi.mock('./three/scene', () => ({ SceneController: class { setBin = vi.fn(); setVisibleCount = vi.fn(); resize = vi.fn(); dispose = vi.fn() } }))

const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer
const stowly = {
  backendInfo: vi.fn(async () => ({ baseUrl: 'http://x', token: 't', error: null as string | null, log: [] as string[] })),
  appVersion: vi.fn(async () => '0.1.0'),
  openExternal: vi.fn(async () => undefined),
  saveText: vi.fn(async () => '/tmp/out'),
  openFiles: vi.fn(async (): Promise<{ name: string; path: string; data: ArrayBuffer }[]> => [])
}

function routes() {
  const { result } = solvedDemo()
  const imported = { ...emptyProject('cargo.csv'), items: [{ id: 'imp', name: '进口箱', x: 100, y: 100, z: 100, copies: 3, rotations: 'all' as const }] }
  return {
    '/api/presets': () => ({ body: presets }),
    'POST /api/solve': () => ({ body: { id: 'j', status: 'running' } }),
    '/api/jobs/j': () => ({ body: { id: 'j', status: 'done', result } }),
    'DELETE /api/jobs/j': () => ({ body: { forgotten: true } }),
    'POST /api/export/placements': () => ({ body: 'bin,item\n' }),
    'POST /api/import': () => ({ body: imported })
  }
}

const button = (text: string | RegExp, index = 0) => {
  const matches = Array.from(document.querySelectorAll('button')).filter((b) => (typeof text === 'string' ? b.textContent?.includes(text) : text.test(b.textContent ?? '')))
  const el = index < 0 ? matches.at(index) : matches[index]
  if (!el) throw new Error(`no button matching ${text}`)
  return el
}
const tab = (text: string) => Array.from(document.querySelectorAll('.ant-tabs-tab')).find((t) => t.textContent?.includes(text)) as HTMLElement
const waitForBackend = () => waitFor(() => expect(button('从预设添加')).toBeEnabled())
const messageText = () => Array.from(document.querySelectorAll('.ant-message-notice')).map((el) => el.textContent).join(' | ')

describe('App', () => {
  beforeEach(() => {
    setupI18n('zh-CN')
    localStorage.removeItem('stowly.language')
    useStowly.setState({ project: emptyProject(), result: null, error: null, solving: false, presets: null, language: 'zh-CN', selectedBin: 0, dirty: false })
    window.stowly = stowly as never
    vi.stubGlobal('fetch', fakeFetch(routes()))
    stowly.backendInfo.mockReset().mockResolvedValue({ baseUrl: 'http://x', token: 't', error: null, log: [] })
    stowly.saveText.mockReset().mockResolvedValue('/tmp/out')
    stowly.openFiles.mockReset().mockResolvedValue([])
  })
  afterEach(() => vi.unstubAllGlobals())  // toasts and React roots are flushed by vitest.setup.ts

  it('connects, solves the demo, exports and saves', async () => {
    // the first poll answers before the backend is ready
    stowly.backendInfo.mockResolvedValueOnce({ error: null, log: [] } as never)
    render(<App />)
    expect(screen.getByText('正在启动求解服务…')).toBeInTheDocument()
    await waitForBackend()
    fireEvent.click(button('载入示例'))
    expect(screen.getByDisplayValue('demo')).toBeInTheDocument()
    fireEvent.click(tab('求解设置'))
    fireEvent.click(screen.getByTestId('solve-button'))
    await waitFor(() => expect(button('导出摆放 CSV')).toBeEnabled())
    expect(screen.getByText('可行解（未证明最优）')).toBeInTheDocument()
    fireEvent.click(button('导出摆放 CSV'))
    await waitFor(() => expect(stowly.saveText).toHaveBeenCalledWith('demo.csv', expect.any(Array), 'bin,item\n'))
    fireEvent.click(button('保存项目'))
    await waitFor(() => expect(stowly.saveText).toHaveBeenCalledWith('demo.json', expect.any(Array), expect.stringContaining('"schema": "stowly/1"')))
    await waitFor(() => expect(messageText()).toContain('已保存到 /tmp/out'))
    fireEvent.click(button('新建'))
    expect(useStowly.getState().project.name).toBe('')
  })

  it('opens projects, imports cargo, adds presets, switches unit and language', async () => {
    render(<App />)
    await waitForBackend()
    // open: cancelled, invalid, then a real project
    fireEvent.click(button('打开项目'))
    stowly.openFiles.mockResolvedValueOnce([{ name: 'bad.json', path: '/bad.json', data: encode('not json') }])
    fireEvent.click(button('打开项目'))
    await waitFor(() => expect(messageText()).toMatch(/JSON|SyntaxError/))
    const opened = { ...emptyProject('opened'), bins: [{ id: 'b1', name: 'crate', x: 1000, y: 800, z: 600, copies: 2 }] }
    stowly.openFiles.mockResolvedValueOnce([{ name: 'p.json', path: '/p.json', data: encode(serializeProject(opened)) }])
    fireEvent.click(button('打开项目'))
    await screen.findByDisplayValue('opened')
    // import a cargo list through the modal
    stowly.openFiles.mockResolvedValueOnce([{ name: 'c.csv', path: '/c.csv', data: encode('name,x,y,z\nA,1,1,1\n') }])
    fireEvent.click(button('导入货物/实例'))
    fireEvent.click(button(/确\s*定/))
    await waitFor(() => expect(messageText()).toContain('已导入 1 种货物、0 种容器'))
    expect(useStowly.getState().project.items.map((i) => i.name)).toEqual(['进口箱'])
    expect(useStowly.getState().project.name).toBe('opened')
    // presets: one container, then one cargo type
    fireEvent.click(button('从预设添加'))
    await screen.findByText('40 尺高柜')
    fireEvent.click(button(/^添\s*加$/))
    expect(useStowly.getState().project.bins.map((b) => b.name)).toEqual(['crate', '40 尺高柜'])
    fireEvent.click(document.querySelector('.ant-drawer-close')!)
    fireEvent.click(tab('货物'))
    fireEvent.click(button('从预设添加', -1))
    await screen.findByText('邮政 1 号纸箱')
    fireEvent.click(button(/^添\s*加$/, -1))
    expect(useStowly.getState().project.items).toHaveLength(2)
    // unit and language
    pickOption(0, 'cm')
    expect(useStowly.getState().project.unit).toBe('cm')
    fireEvent.click(screen.getByText('EN'))
    await waitFor(() => expect(tab('Containers')).toBeTruthy())
    expect(localStorage.getItem('stowly.language')).toBe('en-US')
    fireEvent.click(screen.getByText('中文'))
    await waitFor(() => expect(tab('容器')).toBeTruthy())
  })

  it('shows import failures and a backend that could not start', async () => {
    render(<App />)
    await waitForBackend()
    vi.stubGlobal('fetch', fakeFetch({ ...routes(), 'POST /api/import': () => ({ status: 400, body: { detail: 'unreadable' } }) }))
    stowly.openFiles.mockResolvedValueOnce([{ name: 'c.csv', path: '/c.csv', data: encode('x') }])
    fireEvent.click(button('导入货物/实例'))
    fireEvent.click(button(/确\s*定/))
    await waitFor(() => expect(messageText()).toContain('导入失败: 400: unreadable'))
    cleanup()
    stowly.backendInfo.mockResolvedValue({ error: 'python missing', log: ['traceback'] } as never)
    render(<App />)
    await screen.findByText('求解服务启动失败')
    expect(screen.getByText(/python missing/)).toBeInTheDocument()
  })
})
