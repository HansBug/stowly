import { Alert, Button, Drawer, Input, List, Tabs, Tag, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PresetEntry, Presets } from '../lib/api'
import type { Language } from '../store/project'

interface Props {
  open: boolean
  kind: 'containers' | 'items'
  presets: Presets | null
  language: Language
  onClose: () => void
  onAdd: (entry: PresetEntry) => void
}

export function PresetDrawer({ open, kind, presets, language, onClose, onAdd }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const lang = language === 'zh-CN' ? 'zh' : 'en'
  const entries = presets ? presets[kind] : []
  const categories = useMemo(() => Array.from(new Set(entries.map((e) => e.category))), [entries])
  const filtered = (category: string) => entries.filter((e) => e.category === category && (!query || e.name[lang].toLowerCase().includes(query.toLowerCase()) || e.name.en.toLowerCase().includes(query.toLowerCase())))
  return (
    <Drawer title={t('presets.title')} open={open} onClose={onClose} width={560}>
      <Alert type="info" showIcon message={t('presets.hint')} style={{ marginBottom: 12 }} />
      <Input.Search allowClear placeholder={t('presets.search')} value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
      <Tabs
        items={categories.map((category) => ({
          key: category,
          label: t(`presets.categories.${category}`, { defaultValue: category }),
          children: (
            <List
              size="small"
              dataSource={filtered(category)}
              renderItem={(entry) => (
                <List.Item
                  actions={[
                    <Button key="add" type="primary" size="small" onClick={() => { onAdd(entry); void message.success(t('presets.added', { name: entry.name[lang] })) }}>{t('presets.add')}</Button>
                  ]}>
                  <List.Item.Meta
                    title={entry.name[lang]}
                    description={
                      <div>
                        <Tag>{t('presets.dims')}: {entry.x} × {entry.y} × {entry.z} mm</Tag>
                        {entry.maxWeight ? <Tag>{t('presets.maxWeight')}: {entry.maxWeight} kg</Tag> : null}
                        {entry.weight ? <Tag>{t('presets.weight')}: {entry.weight} kg</Tag> : null}
                        {entry.note?.[lang] ? <div style={{ marginTop: 4 }}>{entry.note[lang]}</div> : null}
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('presets.source')}: {entry.source}</Typography.Text>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          )
        }))}
      />
    </Drawer>
  )
}
