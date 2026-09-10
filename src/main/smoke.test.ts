// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { SMOKE_PROJECT, smokeTest } from './smoke'

const location = { command: '/bundle/python3', env: {} }
const info = { baseUrl: 'http://x', token: 't' }
type Route = (init?: RequestInit) => { status?: number; body: unknown }
function fakeFetch(routes: Record<string, Route>) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input).replace('http://x', '')}`
    const route = routes[key]
    if (!route) return new Response('nope', { status: 404 })
    const { status = 200, body } = route(init)
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
}
const good = (polls = 2): Record<string, Route> => {
  let n = 0
  return {
    'GET /api/health': () => ({ body: { status: 'ok' } }),
    'GET /api/presets': () => ({ body: { containers: [1], items: [1, 2] } }),
    'POST /api/solve': (init) => {
      expect(JSON.parse(String(init?.body))).toEqual(SMOKE_PROJECT)
      return { body: { id: 'j', status: 'running' } }
    },
    'GET /api/jobs/j': () => ({ body: ++n < polls ? { id: 'j', status: 'running' } : { id: 'j', status: 'done', result: { status: 'optimal', value: 2, bins: [{ placements: Array(6) }, { placements: Array(4) }] } } })
  }
}
const sleep = async () => undefined

describe('smokeTest', () => {
  it('passes when every probe answers', async () => {
    const report = await smokeTest({ info, startupError: null, log: ['a'], location, renderer: async () => true, fetchImpl: fakeFetch(good()), sleep })
    expect(report.ok).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.presets).toEqual({ containers: 1, items: 2 })
    expect(report.solve).toMatchObject({ status: 'optimal', value: 2, bins: 2, placements: 10 })
    expect(report.renderer).toBe(true)
    expect(report.python).toBe('/bundle/python3')
  })
  it('fails fast without a backend', async () => {
    const report = await smokeTest({ info: null, startupError: 'no python', log: [], location, renderer: async () => true, fetchImpl: fakeFetch({}), sleep })
    expect(report.ok).toBe(false)
    expect(report.errors[0]).toContain('no python')
  })
  it('collects one error per failing probe', async () => {
    const routes = good()
    routes['GET /api/health'] = () => ({ body: { status: 'degraded' } })
    routes['GET /api/presets'] = () => ({ body: { containers: [], items: [] } })
    routes['GET /api/jobs/j'] = () => ({ body: { id: 'j', status: 'failed', error: 'kaboom' } })
    const report = await smokeTest({ info, startupError: null, log: [], location, renderer: async () => { throw new Error('no window') }, fetchImpl: fakeFetch(routes), sleep })
    expect(report.ok).toBe(false)
    expect(report.errors).toHaveLength(4)
    expect(report.errors.join('\n')).toMatch(/health: .*degraded/)
    expect(report.errors.join('\n')).toMatch(/presets: empty/)
    expect(report.errors.join('\n')).toMatch(/solve: job failed: kaboom/)
    expect(report.errors.join('\n')).toMatch(/renderer: no window/)
  })
  it('flags HTTP errors, wrong placements, a slow job and a blank renderer', async () => {
    const routes = good()
    routes['GET /api/presets'] = () => ({ status: 401, body: { detail: 'no' } })
    routes['GET /api/jobs/j'] = () => ({ body: { id: 'j', status: 'done', result: { status: 'feasible', value: 3, bins: [{ placements: Array(9) }] } } })
    let report = await smokeTest({ info, startupError: null, log: [], location, renderer: async () => false, rendererDetail: async () => 'console: WebGL failed; body: ""', fetchImpl: fakeFetch(routes), sleep })
    expect(report.errors).toEqual(expect.arrayContaining([expect.stringContaining('presets: /api/presets -> 401'), 'solve placed 9 of 10 items', 'renderer did not show the app with presets loaded: console: WebGL failed; body: ""']))
    report = await smokeTest({ info, startupError: null, log: [], location, renderer: async () => false, rendererDetail: async () => { throw new Error('gone') }, fetchImpl: fakeFetch(good()), sleep })
    expect(report.errors).toEqual(['renderer did not show the app with presets loaded: detail unavailable: gone'])
    const slow = good(1000)
    report = await smokeTest({ info, startupError: null, log: [], location, renderer: async () => true, fetchImpl: fakeFetch(slow), sleep, timeoutMs: 0 })
    expect(report.errors[0]).toMatch(/still running after 0 ms/)
    const noSolution = good()
    noSolution['GET /api/jobs/j'] = () => ({ body: { id: 'j', status: 'done', result: { status: 'no-solution', value: null, bins: [] } } })
    report = await smokeTest({ info, startupError: null, log: [], location, renderer: async () => true, fetchImpl: fakeFetch(noSolution), sleep })
    expect(report.errors).toEqual(['solve status no-solution', 'solve placed 0 of 10 items'])
  })
})
