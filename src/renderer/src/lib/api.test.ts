import { describe, expect, it, vi } from 'vitest'
import { BackendClient } from './api'
import { demoProject } from './project'

function fakeFetch(routes: Record<string, (init?: RequestInit) => { status?: number; body: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace('http://x', '')
    const key = `${init?.method ?? 'GET'} ${url}`
    const route = routes[key] ?? routes[url]
    if (!route) return new Response('not found', { status: 404 })
    const { status = 200, body } = route(init)
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' } })
  }) as unknown as typeof fetch
}

describe('BackendClient', () => {
  const info = { baseUrl: 'http://x', token: 'tok' }
  it('sends the token and parses JSON', async () => {
    const fetch = fakeFetch({ '/api/presets': () => ({ body: { containers: [], items: [] } }) })
    const client = new BackendClient(info, fetch)
    expect(await client.presets()).toEqual({ containers: [], items: [] })
    const init = (fetch as unknown as { mock: { calls: [unknown, RequestInit][] } }).mock.calls[0][1]
    expect((init.headers as Record<string, string>)['X-Stowly-Token']).toBe('tok')
  })
  it('surfaces FastAPI error details', async () => {
    const client = new BackendClient(info, fakeFetch({ 'POST /api/solve': () => ({ status: 422, body: { detail: 'needs items' } }) }))
    await expect(client.solve(demoProject())).rejects.toThrow('422: needs items')
  })
  it('polls a job until it finishes and exports CSV', async () => {
    let calls = 0
    const client = new BackendClient(info, fakeFetch({
      'POST /api/solve': () => ({ body: { id: 'j1', status: 'running' } }),
      '/api/jobs/j1': () => ({ body: { id: 'j1', status: ++calls < 3 ? 'running' : 'done', result: null } }),
      'DELETE /api/jobs/j1': () => ({ body: { forgotten: true } }),
      'POST /api/export/placements': () => ({ body: 'bin,item\n' })
    }))
    const job = await client.solve(demoProject())
    const ticks: string[] = []
    const finished = await client.waitForJob(job.id, 1, (state) => ticks.push(state.status))
    expect(finished.status).toBe('done')
    expect(ticks).toEqual(['running', 'running', 'done'])
    await client.forget('j1')
    expect(await client.exportPlacements(demoProject(), { status: 'optimal', solver: 'box', objective: 'bin-packing', value: 1, bound: 1, solveTime: 0, wallTime: 0, bins: [], counts: [], statistics: {}, options: {} })).toBe('bin,item\n')
  })
  it('uploads files as multipart', async () => {
    const fetch = fakeFetch({ 'POST /api/import': () => ({ body: demoProject() }) })
    const client = new BackendClient(info, fetch)
    const project = await client.importFiles([{ name: 'a.csv', data: new TextEncoder().encode('a,b').buffer }], 'cm', 2)
    expect(project.name).toBe('demo')
    const init = (fetch as unknown as { mock: { calls: [unknown, RequestInit][] } }).mock.calls[0][1]
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('unit')).toBe('cm')
  })
})
