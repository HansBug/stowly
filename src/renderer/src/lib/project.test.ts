import { describe, expect, it } from 'vitest'
import { demoProject, emptyProject, fromMm, newId, parseProject, serializeProject, toMm, totalBinVolume, totalItemVolume, validateProject } from './project'

describe('units', () => {
  it('converts to millimetres and back', () => {
    expect(toMm(1.5, 'm')).toBe(1500)
    expect(toMm(12, 'in')).toBe(305)
    expect(toMm(0, 'mm')).toBe(1)
    expect(fromMm(1500, 'm')).toBe(1.5)
    expect(fromMm(1234, 'cm')).toBe(123.4)
    expect(fromMm(1234, 'mm')).toBe(1234)
  })
})

describe('project', () => {
  it('validates the parts the backend needs', () => {
    const project = emptyProject()
    expect(validateProject(project)).toEqual(['no-bins', 'no-items'])
    project.bins.push({ id: 'b', name: '', x: 10, y: 10, z: 0, copies: 1, openSides: ['x-max'] })
    project.items.push({ id: 'i', name: '', x: 1, y: 1, z: 1, copies: 0, rotations: 'all' })
    project.settings.timeLimit = 0
    expect(validateProject(project)).toEqual(['bad-dimension:b', 'bad-copies:i', 'bad-time-limit'])
    expect(validateProject(demoProject())).toEqual([])
  })
  it('round-trips through JSON and fills defaults for older files', () => {
    const demo = demoProject()
    expect(parseProject(serializeProject(demo))).toEqual(demo)
    const old = parseProject('{"schema": "stowly/0", "bins": [{"id": "b", "name": "", "x": 1, "y": 2, "z": 3}], "items": [{"id": "i", "name": "", "x": 1, "y": 1, "z": 1}]}')
    expect(old.bins[0].copies).toBe(1)
    expect(old.items[0].rotations).toBe('all')
    expect(old.settings.solver).toBe('boxstacks')
    expect(old.unit).toBe('mm')
    expect(() => parseProject('{"foo": 1}')).toThrow(/not a Stowly project/)
  })
  it('sums volumes and mints unique ids', () => {
    const demo = demoProject()
    expect(totalBinVolume(demo)).toBe(12032 * 2352 * 2698)
    expect(totalItemVolume(demo)).toBeGreaterThan(totalBinVolume(demo))
    expect(newId('x')).not.toBe(newId('x'))
  })

  it('fills the fields older project files lack', () => {
    const old = JSON.stringify({ schema: 'stowly/1', name: 'legacy', bins: [{ id: 'b', name: 'b', x: 10, y: 10, z: 10 }], items: [{ id: 'i', name: 'i', x: 1, y: 1, z: 1 }], settings: { solver: 'boxstacks' } })
    const project = parseProject(old)
    expect(project.bins[0].openSides).toEqual(['x-max'])
    expect(project.items[0].group).toBe(0)
    expect(project.items[0].rotations).toBe('all')
    expect(project.settings.unloadingConstraint).toBe('none')
    expect(project.settings.solver).toBe('boxstacks')
  })
})

describe('time mode defaults', () => {
  it('starts new and demo projects on boxstacks with the automatic budget', () => {
    expect(emptyProject().settings).toMatchObject({ solver: 'boxstacks', timeMode: 'auto', timeLimit: 30 })
    expect(demoProject().settings).toMatchObject({ solver: 'boxstacks', objective: 'knapsack', timeMode: 'auto' })
  })

  it('keeps the explicit time limit of an old project file as a manual budget', () => {
    const old = parseProject(JSON.stringify({ schema: 'stowly/1', name: 'x', bins: [], items: [], settings: { solver: 'box', objective: 'knapsack', timeLimit: 10, optimizationMode: 'anytime', unloadingConstraint: 'none' } }))
    expect(old.settings).toMatchObject({ solver: 'box', timeMode: 'manual', timeLimit: 10 })
    const fresh = parseProject(JSON.stringify({ schema: 'stowly/1', name: 'y', bins: [], items: [] }))
    expect(fresh.settings.timeMode).toBe('auto')
    const auto = parseProject(JSON.stringify({ schema: 'stowly/1', name: 'z', bins: [], items: [], settings: { timeMode: 'auto', timeLimit: 99 } }))
    expect(auto.settings.timeMode).toBe('auto')
  })
})
