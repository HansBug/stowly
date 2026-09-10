/**
 * Drive the built app with Playwright's Electron support and leave screenshots + console errors behind.
 * Usage: npm run build && node scripts/ui-probe.mjs [outDir]
 * Needs a display (DISPLAY) and, on hosts that restrict unprivileged user namespaces, runs un-sandboxed.
 */
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const outDir = process.argv[2] ?? '/tmp/stowly_ui'
fs.mkdirSync(outDir, { recursive: true })
const problems = []
let shotIndex = 0

const app = await electron.launch({
  args: [path.join(root, 'out/main/index.js'), '--no-sandbox'],
  cwd: root,
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' },
})
const page = await app.firstWindow()
// The language choice persists in localStorage; start every run from the Chinese default.
await page.waitForLoadState('domcontentloaded')
await page.evaluate(() => localStorage.removeItem('stowly.language'))
await page.reload()
page.on('console', (msg) => { if (['error', 'warning'].includes(msg.type())) problems.push(`[console.${msg.type()}] ${msg.text().slice(0, 400)}`) })
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`))
page.setDefaultTimeout(15000)
// Native dialogs cannot be driven; answer them from the main process instead.
await app.evaluate(({ dialog }, dir) => {
  dialog.showSaveDialog = async (opts) => ({ canceled: false, filePath: `${dir}/${opts.defaultPath}` })
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [`${dir}/cargo.csv`] })
}, outDir)

const shot = async (name) => {
  const file = path.join(outDir, `${String(++shotIndex).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file })
  console.log('shot', file)
}
const step = async (name, fn) => {
  try { await fn(); console.log('ok  ', name) } catch (err) {
    console.log('FAIL', name, '-', err.message.split('\n')[0]); await shot(`${name}-failed`).catch(() => {})
    for (let i = 0; i < 2; i++) await page.keyboard.press('Escape')  // close whatever overlay the failure left open
  }
}
const overflow = async (label) => {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }))
  if (o.sw > o.cw || o.sh > o.ch) problems.push(`[layout] ${label}: page overflows (${o.sw}x${o.sh} in ${o.cw}x${o.ch})`)
}

await step('backend ready', async () => {
  await page.getByRole('button', { name: '从预设添加' }).first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.body.innerText.includes('正在启动求解服务'), null, { timeout: 60000 })
  await page.waitForTimeout(500)
  await shot('initial')
  await overflow('initial')
  const alert = await page.locator('.ant-alert-error').count()
  if (alert) problems.push(`[ui] error alert visible on start: ${await page.locator('.ant-alert-error').innerText()}`)
})

await step('load demo', async () => {
  await page.getByRole('button', { name: '载入示例' }).click()
  await page.waitForTimeout(400)
  await shot('demo-bins')
  await overflow('demo bins')
})

await step('items tab', async () => {
  await page.getByRole('tab', { name: /货物/ }).click()
  await page.waitForTimeout(400)
  await shot('demo-items')
  await overflow('demo items')
})

await step('preset drawer', async () => {
  await page.getByRole('button', { name: '从预设添加' }).first().click()
  await page.waitForTimeout(600)
  await shot('preset-drawer')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
})

await step('settings + solve', async () => {
  await page.getByRole('tab', { name: '求解设置' }).click()
  await page.waitForTimeout(300)
  await shot('settings')
  await page.getByTestId('solve-button').click()
  await page.waitForTimeout(1500)
  await shot('solving')
  await page.getByRole('button', { name: '导出摆放 CSV' }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('导出摆放 CSV')); return b && !b.disabled }, null, { timeout: 90000 })
  await page.waitForTimeout(1200)
  await shot('solved')
  await overflow('solved')
  const text = await page.locator('body').innerText()
  const m = text.match(/(已证明最优|可行解（未证明最优）|没有找到解|不可行|求解失败)/)
  console.log('     result status text:', m ? m[1] : '(none found)')
})

await step('export csv', async () => {
  await page.getByRole('button', { name: '导出摆放 CSV' }).click()
  await page.waitForTimeout(800)
  const csv = path.join(outDir, 'demo.csv')
  if (!fs.existsSync(csv)) problems.push('[ui] export did not write demo.csv')
  else console.log('     export csv lines:', fs.readFileSync(csv, 'utf-8').trim().split('\n').length)
})

await step('viewer hover/click', async () => {
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(400)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(400)
  await shot('viewer-click')
})

await step('import modal', async () => {
  await page.getByRole('button', { name: '导入货物/实例' }).click()
  await page.waitForTimeout(500)
  await shot('import-modal')
  await page.getByRole('button', { name: /取\s*消/ }).click()
  await page.waitForTimeout(300)
})

await step('english', async () => {
  await page.getByText('EN', { exact: true }).click()
  await page.waitForTimeout(600)
  await shot('english')
  // Cargo names in the demo are Chinese by design; only chrome (header, tabs, forms, result labels) must switch.
  // Hidden modals keep stale text until reopened (rc-dialog does not re-render hidden children), so only visible chrome counts.
  const zh = await page.evaluate(() => [...document.querySelectorAll('.ant-layout-header, .ant-tabs-nav, .ant-form, .ant-descriptions-item-label, .ant-table-thead')].filter((el) => el.checkVisibility()).map((el) => el.innerText).join(' ').replace('中文', '').match(/[一-鿿]+/g))
  if (zh) problems.push(`[i18n] Chinese chrome text remains after switching to English: ${[...new Set(zh)].join(' ')}`)
  await page.getByText('中文', { exact: true }).click()
  await page.waitForTimeout(400)
})


await step('manual container add/edit/delete', async () => {
  await page.getByRole('button', { name: '新建' }).click()
  await page.getByRole('tab', { name: /容器/ }).click()
  await page.getByRole('button', { name: '添加容器' }).click()
  await page.waitForTimeout(300)
  const inputs = page.locator('.ant-table-tbody input')
  const n = await inputs.count()
  console.log('     inputs in new container row:', n)
  await inputs.nth(0).fill('测试箱')
  await inputs.nth(1).fill('1000'); await inputs.nth(1).press('Tab')
  await page.waitForTimeout(200)
  await shot('manual-container')
  await page.locator('.ant-table-tbody button.ant-btn-dangerous').first().click()
  await page.getByRole('button', { name: /确\s*定/ }).click()
  await page.waitForTimeout(300)
  const rows = await page.locator('.ant-table-tbody tr.ant-table-row').count()
  if (rows !== 0) problems.push(`[ui] container row not deleted (${rows} left)`)
})

await step('unit switch converts values', async () => {
  await page.getByRole('button', { name: '载入示例' }).click()
  await page.getByRole('tab', { name: /容器/ }).click()
  await page.waitForTimeout(200)
  const before = await page.locator('.ant-table-tbody input').nth(1).inputValue()
  await page.locator('.ant-layout-header .ant-select').click()
  await page.locator('.ant-select-item-option').filter({ hasText: /^cm$/ }).click()
  await page.waitForTimeout(300)
  const after = await page.locator('.ant-table-tbody input').nth(1).inputValue()
  console.log(`     length ${before} mm -> ${after} cm`)
  if (Number(after) * 10 !== Number(before)) problems.push(`[ui] unit switch did not convert: ${before} mm -> ${after} cm`)
  await shot('unit-cm')
  await page.locator('.ant-layout-header .ant-select').click()
  await page.locator('.ant-select-item-option').filter({ hasText: /^mm$/ }).click()
})

await step('preset add', async () => {
  await page.getByRole('tab', { name: /货物/ }).click()
  await page.waitForTimeout(300)
  const before = await page.locator('.ant-table-tbody tr.ant-table-row').count()
  await page.getByRole('button', { name: '从预设添加' }).filter({ visible: true }).click()
  await page.waitForTimeout(500)
  await page.locator('.ant-drawer').getByRole('button', { name: /^添\s*加$/ }).first().click()  // not the sider's 添加货物 behind the mask
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const after = await page.locator('.ant-table-tbody tr.ant-table-row').count()
  if (after !== before + 1) problems.push(`[ui] preset add: rows ${before} -> ${after}`)
  await shot('preset-added')
})

await step('save/import through stubbed dialogs', async () => {
  await page.getByRole('button', { name: '保存项目' }).click()
  await page.waitForTimeout(600)
  if (!fs.existsSync(path.join(outDir, 'demo.json'))) problems.push('[ui] save did not write demo.json')
  const before = await page.locator('.ant-table-tbody tr.ant-table-row').count()
  await page.getByRole('button', { name: '导入货物/实例' }).click()
  await page.getByRole('button', { name: /确\s*定/ }).click()
  await page.waitForTimeout(1500)
  await shot('after-import')
  const after = await page.locator('.ant-table-tbody tr.ant-table-row').count()
  if (after !== before + 2) problems.push(`[ui] CSV import: rows ${before} -> ${after}`)
})

console.log('\n=== problems (%d) ===', problems.length)
for (const p of [...new Set(problems)]) console.log(p)
await app.close()
