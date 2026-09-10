import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { setupI18n } from '../i18n'
import { emptyProject } from '../lib/project'
import { solvedDemo } from '../test/fixtures'
import type { BoxDescriptor, SceneOptions } from '../three/scene'
import { Viewer3D } from './Viewer3D'

const fake = vi.hoisted(() => {
  const scenes: FakeScene[] = []
  class FakeScene {
    setBin = vi.fn()
    setVisibleCount = vi.fn()
    resize = vi.fn()
    dispose = vi.fn()
    constructor(public container: HTMLElement, public options: SceneOptions) { scenes.push(this) }
  }
  return { scenes, FakeScene }
})
vi.mock('../three/scene', () => ({ SceneController: fake.FakeScene }))

setupI18n('zh-CN')

describe('Viewer3D', () => {
  it('shows the empty state without containers and a preview with them', () => {
    const { rerender } = render(<Viewer3D project={emptyProject()} result={null} selectedBin={0} onSelectBin={vi.fn()} />)
    expect(screen.getByText('没有可显示的容器')).toBeInTheDocument()
    const { project } = solvedDemo()
    rerender(<Viewer3D project={project} result={null} selectedBin={0} onSelectBin={vi.fn()} />)
    const scene = fake.scenes.at(-1)!
    expect(scene.setBin).toHaveBeenLastCalledWith(expect.objectContaining({ x: 12032, placements: [] }), expect.any(Object))
    expect(screen.queryByText('装载顺序')).not.toBeInTheDocument()
  })

  it('drives the scene from the result, the slider and the pointer callbacks', () => {
    const { project, result } = solvedDemo()
    const two = { ...result, bins: [result.bins[0], { ...result.bins[0], binIndex: 1, copies: 2 }] }
    const onSelectBin = vi.fn()
    render(<Viewer3D project={project} result={two} selectedBin={0} onSelectBin={onSelectBin} />)
    const scene = fake.scenes.at(-1)!
    expect(scene.setBin).toHaveBeenCalledWith(two.bins[0], expect.any(Object))
    expect(screen.getByText('利用率 42.0%')).toBeInTheDocument()
    expect(screen.getByText('3/3')).toBeInTheDocument()
    fireEvent.click(screen.getByText('容器 2 ×2'))
    expect(onSelectBin).toHaveBeenCalledWith(1)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft', keyCode: 37 })
    expect(scene.setVisibleCount).toHaveBeenLastCalledWith(2)
    fireEvent.click(screen.getByRole('button', { name: '全部显示' }))
    expect(scene.setVisibleCount).toHaveBeenLastCalledWith(Infinity)
    const box: BoxDescriptor = { index: 0, placement: two.bins[0].placements[0], center: [0, 0, 0], size: [1, 1, 1], color: '#fff' }
    act(() => scene.options.onHover?.(box))
    expect(screen.getByText(/邮政 1 号纸箱 @ \(0, 0, 0\) 530×290×370 XYZ/)).toBeInTheDocument()
    act(() => scene.options.onSelect?.(box))
    act(() => scene.options.onHover?.(null))
    expect(screen.getByText(/邮政 1 号纸箱 @/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重置视角' }))
    expect(scene.setBin).toHaveBeenCalledTimes(2)
  })
})
