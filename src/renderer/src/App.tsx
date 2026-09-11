import { Alert, Badge, Button, ConfigProvider, Input, Layout, Segmented, Select, Space, Spin, Tabs, Tag, Typography, message } from 'antd'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import { FileAddOutlined, FolderOpenOutlined, ImportOutlined, SaveOutlined, ExperimentOutlined, ExportOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EditableTable } from './components/EditableTable'
import { ImportModal } from './components/ImportModal'
import { PresetDrawer } from './components/PresetDrawer'
import { ResultPanel } from './components/ResultPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { Viewer3D } from './components/Viewer3D'
import { BackendClient, type BackendInfo, type PresetEntry } from './lib/api'
import { newId, parseProject, serializeProject, type Unit } from './lib/project'
import { setupI18n } from './i18n'
import { useStowly, type Language } from './store/project'

const PROJECT_FILTER = [{ name: 'Stowly project', extensions: ['json'] }]
const IMPORT_FILTER = [{ name: 'Cargo lists and instances', extensions: ['csv', 'xlsx', 'xlsm', 'json', 'txt', 'dat', 'thpack'] }]

export function App() {
  const { t } = useTranslation()
  const s = useStowly()
  const [backend, setBackend] = useState<BackendInfo | null>(null)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<'containers' | 'items' | null>(null)
  const [importing, setImporting] = useState(false)
  const client = useMemo(() => (backend ? new BackendClient(backend) : null), [backend])
  const stacked = s.project.settings.solver === 'boxstacks'

  useEffect(() => {
    setupI18n(s.language)
    document.documentElement.lang = s.language
  }, [s.language])

  useEffect(() => {
    let cancelled = false
    const connect = async () => {
      for (let attempt = 0; attempt < 60 && !cancelled; attempt++) {
        const info = await window.stowly?.backendInfo()
        if (info?.baseUrl && info.token) {
          setBackend({ baseUrl: info.baseUrl, token: info.token })
          return
        }
        if (info?.error) {
          setBackendError(`${info.error}\n${info.log.join('\n')}`)
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    void connect()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (client) client.presets().then(s.setPresets).catch((err) => setBackendError(String(err)))
  }, [client])

  const save = async () => {
    const path = await window.stowly?.saveText(`${s.project.name || 'project'}.json`, PROJECT_FILTER, serializeProject(s.project))
    if (path) void message.success(t('common.saved', { path }))
  }
  const open = async () => {
    const files = (await window.stowly?.openFiles(PROJECT_FILTER)) ?? []
    if (!files.length) return
    try {
      s.setProject(parseProject(new TextDecoder().decode(files[0].data)))
    } catch (err) {
      void message.error(String(err))
    }
  }
  const importFiles = async (unit: Unit, instanceIndex: number) => {
    const files = (await window.stowly?.openFiles(IMPORT_FILTER, true)) ?? []
    if (!files.length || !client) return
    try {
      const imported = await client.importFiles(files, unit, instanceIndex)
      s.mergeImport(imported)
      void message.success(t('import.ok', { items: imported.items.length, bins: imported.bins.length }))
      setImporting(false)
    } catch (err) {
      void message.error(`${t('import.failed')}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const exportCsv = async () => {
    if (!client || !s.result) return
    const csv = await client.exportPlacements(s.project, s.result)
    const path = await window.stowly?.saveText(`${s.project.name || 'placements'}.csv`, [{ name: 'CSV', extensions: ['csv'] }], csv)
    if (path) void message.success(t('common.saved', { path }))
  }
  const addPreset = (entry: PresetEntry) => {
    const lang = s.language === 'zh-CN' ? 'zh' : 'en'
    if (drawer === 'containers') s.addBin({ id: newId('bin'), name: entry.name[lang], x: entry.x, y: entry.y, z: entry.z, copies: 1, cost: 1, maxWeight: entry.maxWeight ?? null, openSides: entry.openSides ?? ['x-max'] })
    else s.addItem({ id: newId('item'), name: entry.name[lang], x: entry.x, y: entry.y, z: entry.z, copies: 10, weight: entry.weight ?? null, rotations: 'all', group: 0 })
  }

  return (
    <ConfigProvider locale={s.language === 'zh-CN' ? zhCN : enUS} theme={{ token: { borderRadius: 6 } }}>
      <Layout style={{ height: '100vh' }}>
        <Layout.Header style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '8px 16px', height: 'auto', minHeight: 56, lineHeight: 'normal', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Typography.Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>{t('app.title')}</Typography.Title>
          <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>{t('app.subtitle')}</Typography.Text>
          <Input placeholder={t('app.projectName')} value={s.project.name} onChange={(e) => s.setName(e.target.value)} style={{ width: 200 }} size="small" />
          {s.dirty ? <Badge status="warning" text={t('common.unsaved')} /> : null}
          <div style={{ flex: 1 }} />
          <Space size="small" wrap>
            <Button size="small" icon={<FileAddOutlined />} onClick={s.newProject}>{t('menu.new')}</Button>
            <Button size="small" icon={<FolderOpenOutlined />} onClick={open}>{t('menu.open')}</Button>
            <Button size="small" icon={<SaveOutlined />} onClick={save}>{t('menu.save')}</Button>
            <Button size="small" icon={<ImportOutlined />} onClick={() => setImporting(true)} disabled={!client}>{t('menu.import')}</Button>
            <Button size="small" icon={<ExportOutlined />} onClick={exportCsv} disabled={!s.result}>{t('menu.exportCsv')}</Button>
            <Button size="small" icon={<ExperimentOutlined />} onClick={s.loadDemo}>{t('menu.demo')}</Button>
            <Select size="small" prefix={t('menu.unit')} value={s.project.unit} onChange={s.setUnit} options={(['mm', 'cm', 'm', 'in'] as Unit[]).map((u) => ({ value: u, label: u }))} style={{ width: 110 }} />
            <Segmented size="small" value={s.language} onChange={(value) => s.setLanguage(value as Language)} options={[{ value: 'zh-CN', label: '中文' }, { value: 'en-US', label: 'EN' }]} data-testid="language-switch" />
          </Space>
        </Layout.Header>
        <Layout>
          <Layout.Sider width={760} theme="light" style={{ borderRight: '1px solid #eee', overflow: 'auto', padding: 12 }}>
            {backendError ? <Alert type="error" showIcon message={t('app.backendFailed')} description={<pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{backendError}</pre>} style={{ marginBottom: 12 }} /> : null}
            {!backend && !backendError ? <Space style={{ marginBottom: 12 }}><Spin size="small" />{t('app.backendStarting')}</Space> : null}
            <Tabs
              items={[
                {
                  key: 'bins', label: <span>{t('tabs.bins')} <Tag>{s.project.bins.length}</Tag></span>,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space><Button type="primary" size="small" onClick={() => s.addBin()}>{t('bins.add')}</Button><Button size="small" onClick={() => setDrawer('containers')} disabled={!s.presets}>{t('bins.preset')}</Button></Space>
                      <EditableTable rows={s.project.bins} unit={s.project.unit} kind="bins" stacking={stacked} onChange={s.updateBin} onRemove={s.removeBin} />
                    </Space>
                  )
                },
                {
                  key: 'items', label: <span>{t('tabs.items')} <Tag>{s.project.items.length}</Tag></span>,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space><Button type="primary" size="small" onClick={() => s.addItem()}>{t('items.add')}</Button><Button size="small" onClick={() => setDrawer('items')} disabled={!s.presets}>{t('items.preset')}</Button></Space>
                      {stacked ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('items.stackingUpright')}</Typography.Text> : <Typography.Text type="secondary" style={{ fontSize: 12 }} data-testid="stacking-note">{t('items.stackingOnly')}</Typography.Text>}
                      <EditableTable rows={s.project.items} unit={s.project.unit} kind="items" stacking={stacked} onChange={s.updateItem} onRemove={s.removeItem} />
                    </Space>
                  )
                },
                { key: 'settings', label: t('tabs.settings'), children: <SettingsPanel project={s.project} solving={s.solving} onChange={s.updateSettings} onSolve={() => client && s.solve(client)} /> }
              ]}
            />
          </Layout.Sider>
          <Layout.Content style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ flex: 3, minHeight: 0, borderBottom: '1px solid #eee' }}>
              <Viewer3D project={s.project} result={s.result} selectedBin={s.selectedBin} onSelectBin={s.setSelectedBin} />
            </div>
            <div style={{ flex: 2, minHeight: 0, overflow: 'auto', padding: 12 }}>
              <ResultPanel project={s.project} result={s.result} error={s.error} selectedBin={s.selectedBin} onExport={exportCsv} />
            </div>
          </Layout.Content>
        </Layout>
      </Layout>
      <PresetDrawer open={drawer !== null} kind={drawer ?? 'containers'} presets={s.presets} language={s.language} onClose={() => setDrawer(null)} onAdd={addPreset} />
      <ImportModal open={importing} defaultUnit={s.project.unit} onCancel={() => setImporting(false)} onPick={importFiles} />
    </ConfigProvider>
  )
}
