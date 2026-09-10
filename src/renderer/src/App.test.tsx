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

const waitForBackend = () => waitFor(() => expect(screen.getAllByRole('button', { name: '从预设添加' })[0]).toBeEnabled())
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
  afterEach(() => vi.unstubAllGlobals())

  it('connects, solves the demo, exports and saves', async () => {
    // the first poll answers before the backend is ready
    stowly.backendInfo.mockResolvedValueOnce({ error: null, log: [] } as never)
    render(<App />)
    expect(screen.getByText('正在启动求解服务…')).toBeInTheDocument()
    await waitForBackend()
    fireEvent.click(screen.getByRole('button', { name: /载入示例/ }))
    expect(screen.getByDisplayValue('demo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /求解设置/ }))
    fireEvent.click(screen.getByTestId('solve-button'))
    await waitFor(() => expect(screen.getByRole('button', { name: /导出摆放 CSV/ })).toBeEnabled())
    expect(screen.getByText('可行解（未证明最优）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /导出摆放 CSV/ }))
    await waitFor(() => expect(stowly.saveText).toHaveBeenCalledWith('demo.csv', expect.any(Array), 'bin,item\n'))
    fireEvent.click(screen.getByRole('button', { name: /保存项目/ }))
    await waitFor(() => expect(stowly.saveText).toHaveBeenCalledWith('demo.json', expect.any(Array), expect.stringContaining('"schema": "stowly/1"')))
    await waitFor(() => expect(messageText()).toContain('已保存到 /tmp/out'))
    fireEvent.click(screen.getByRole('button', { name: /新建/ }))
    expect(useStowly.getState().project.name).toBe('')
  })

  it('opens projects, imports cargo, adds presets, switches unit and language', async () => {
    render(<App />)
    await waitForBackend()
    // open: cancelled, invalid, then a real project
    fireEvent.click(screen.getByRole('button', { name: /打开项目/ }))
    stowly.openFiles.mockResolvedValueOnce([{ name: 'bad.json', path: '/bad.json', data: encode('not json') }])
    fireEvent.click(screen.getByRole('button', { name: /打开项目/ }))
    await waitFor(() => expect(messageText()).toMatch(/JSON|SyntaxError/))
    const opened = { ...emptyProject('opened'), bins: [{ id: 'b1', name: 'crate', x: 1000, y: 800, z: 600, copies: 2 }] }
    stowly.openFiles.mockResolvedValueOnce([{ name: 'p.json', path: '/p.json', data: encode(serializeProject(opened)) }])
    fireEvent.click(screen.getByRole('button', { name: /打开项目/ }))
    await screen.findByDisplayValue('opened')
    // import a cargo list through the modal
    stowly.openFiles.mockResolvedValueOnce([{ name: 'c.csv', path: '/c.csv', data: encode('name,x,y,z\nA,1,1,1\n') }])
    fireEvent.click(screen.getByRole('button', { name: /导入货物\/实例/ }))
    fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }))
    await waitFor(() => expect(messageText()).toContain('已导入 1 种货物、0 种容器'))
    expect(useStowly.getState().project.items.map((i) => i.name)).toEqual(['进口箱'])
    expect(useStowly.getState().project.name).toBe('opened')
    // presets: one container, then one cargo type
    fireEvent.click(screen.getAllByRole('button', { name: '从预设添加' })[0])
    await screen.findByText('40 尺高柜')
    fireEvent.click(screen.getAllByRole('button', { name: /^添\s*加$/ })[0])
    expect(useStowly.getState().project.bins.map((b) => b.name)).toEqual(['crate', '40 尺高柜'])
    fireEvent.click(document.querySelector('.ant-drawer-close')!)
    fireEvent.click(screen.getByRole('tab', { name: /货物/ }))
    fireEvent.click(screen.getAllByRole('button', { name: '从预设添加' }).at(-1)!)
    await screen.findByText('邮政 1 号纸箱')
    fireEvent.click(screen.getAllByRole('button', { name: /^添\s*加$/ }).at(-1)!)
    expect(useStowly.getState().project.items).toHaveLength(2)
    // unit and language
    pickOption(0, 'cm')
    expect(useStowly.getState().project.unit).toBe('cm')
    fireEvent.click(screen.getByText('EN'))
    await screen.findByRole('tab', { name: /Containers/ })
    expect(localStorage.getItem('stowly.language')).toBe('en-US')
    fireEvent.click(screen.getByText('中文'))
    await screen.findByRole('tab', { name: /容器/ })
  })

  it('shows import failures and a backend that could not start', async () => {
    render(<App />)
    await waitForBackend()
    vi.stubGlobal('fetch', fakeFetch({ ...routes(), 'POST /api/import': () => ({ status: 400, body: { detail: 'unreadable' } }) }))
    stowly.openFiles.mockResolvedValueOnce([{ name: 'c.csv', path: '/c.csv', data: encode('x') }])
    fireEvent.click(screen.getByRole('button', { name: /导入货物\/实例/ }))
    fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }))
    await waitFor(() => expect(messageText()).toContain('导入失败: 400: unreadable'))
    cleanup()
    stowly.backendInfo.mockResolvedValue({ error: 'python missing', log: ['traceback'] } as never)
    render(<App />)
    await screen.findByText('求解服务启动失败')
    expect(screen.getByText(/python missing/)).toBeInTheDocument()
  })
})
