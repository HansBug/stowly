import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackendClient } from '../lib/api'
import { demoProject, emptyProject } from '../lib/project'
import { useStowly } from './project'

describe('stowly store', () => {
  beforeEach(() => useStowly.getState().setProject(emptyProject()))

  it('edits bins and items and tracks dirtiness', () => {
    const s = useStowly.getState()
    expect(s.dirty).toBe(false)
    s.addBin({ name: 'crate' })
    s.addItem({ name: 'box', copies: 3 })
    let state = useStowly.getState()
    expect(state.project.bins).toHaveLength(1)
    expect(state.project.items[0].copies).toBe(3)
    expect(state.dirty).toBe(true)
    state.updateItem(state.project.items[0].id, { x: 999 })
    state.updateBin(state.project.bins[0].id, { copies: 4 })
    state = useStowly.getState()
    expect(state.project.items[0].x).toBe(999)
    expect(state.project.bins[0].copies).toBe(4)
    state.removeItem(state.project.items[0].id)
    state.removeBin(state.project.bins[0].id)
    state = useStowly.getState()
    expect(state.project.items).toHaveLength(0)
    expect(state.project.bins).toHaveLength(0)
  })

  it('merges imports without dropping the other side', () => {
    const s = useStowly.getState()
    s.loadDemo()
    const imported = { ...emptyProject('cargo'), items: [{ id: 'x', name: 'x', x: 1, y: 1, z: 1, copies: 1, rotations: 'all' as const }] }
    useStowly.getState().mergeImport(imported)
    const state = useStowly.getState()
    // A cargo list is appended and leaves the project name alone.
    expect(state.project.items).toHaveLength(6)
    expect(state.project.bins).toHaveLength(1)
    expect(state.project.name).toBe('demo')
    // A complete instance replaces containers, cargo and settings.
    const instance = { ...imported, name: 'thpack', bins: [{ id: 'b', name: 'b', x: 10, y: 10, z: 10, copies: 1, cost: 1, maxWeight: null }], settings: { ...imported.settings, timeLimit: 7 } }
    useStowly.getState().mergeImport(instance)
    expect(useStowly.getState().project).toMatchObject({ name: 'thpack', bins: instance.bins, items: instance.items, settings: { timeLimit: 7 } })
  })

  it('covers the small setters', () => {
    const s = useStowly.getState()
    s.setName('n'); s.setUnit('cm'); s.updateSettings({ timeLimit: 3 }); s.setSelectedBin(2); s.setError('e'); s.setPresets({ containers: [], items: [] })
    const state = useStowly.getState()
    expect(state.project.name).toBe('n')
    expect(state.project.unit).toBe('cm')
    expect(state.project.settings.timeLimit).toBe(3)
    expect(state.selectedBin).toBe(2)
    expect(state.error).toBe('e')
    expect(state.presets).toEqual({ containers: [], items: [] })
    state.newProject()
    expect(useStowly.getState().project.items).toHaveLength(0)
    state.setResult(null)
    expect(useStowly.getState().result).toBeNull()
  })

  it('persists the language choice', () => {
    useStowly.getState().setLanguage('en-US')
    expect(useStowly.getState().language).toBe('en-US')
    expect(localStorage.getItem('stowly.language')).toBe('en-US')
    useStowly.getState().setLanguage('zh-CN')
  })

  it('runs a solve through the client and stores the result or the error', async () => {
    useStowly.getState().setProject(demoProject())
    const result = { status: 'optimal', objective: 'knapsack', value: 1, bound: 1, solveTime: 0, wallTime: 0, bins: [], counts: [], statistics: {}, options: {} }
    const client = {
      solve: vi.fn(async () => ({ id: 'j', status: 'running' })),
      waitForJob: vi.fn(async () => ({ id: 'j', status: 'done', result })),
      forget: vi.fn(async () => undefined)
    } as unknown as BackendClient
    await useStowly.getState().solve(client)
    expect(useStowly.getState().result).toEqual(result)
    expect(useStowly.getState().solving).toBe(false)
    const failing = { ...client, waitForJob: vi.fn(async () => ({ id: 'j', status: 'failed', error: 'boom' })) } as unknown as BackendClient
    await useStowly.getState().solve(failing)
    expect(useStowly.getState().error).toBe('boom')
    const throwing = { ...client, solve: vi.fn(async () => { throw new Error('offline') }) } as unknown as BackendClient
    await useStowly.getState().solve(throwing)
    expect(useStowly.getState().error).toBe('offline')
  })
})
