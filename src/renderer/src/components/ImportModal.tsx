import { Alert, Form, InputNumber, Modal, Select } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Unit } from '../lib/project'

interface Props {
  open: boolean
  defaultUnit: Unit
  onCancel: () => void
  onPick: (unit: Unit, instanceIndex: number) => Promise<void>
}

/** Asks for the file's unit and (for thpack files) the instance index, then lets the parent open the file dialog. */
export function ImportModal({ open, defaultUnit, onCancel, onPick }: Props) {
  const { t } = useTranslation()
  const [unit, setUnit] = useState<Unit>(defaultUnit)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={t('import.title')} open={open} onCancel={onCancel} okText={t('common.confirm')} cancelText={t('common.cancel')} confirmLoading={busy}
      onOk={async () => { setBusy(true); try { await onPick(unit, index) } finally { setBusy(false) } }}>
      <Alert type="info" showIcon message={t('import.hint')} style={{ marginBottom: 12 }} />
      <Form layout="vertical" size="small">
        <Form.Item label={t('import.unit')}>
          <Select value={unit} onChange={setUnit} options={(['mm', 'cm', 'm', 'in'] as Unit[]).map((u) => ({ value: u, label: u }))} />
        </Form.Item>
        <Form.Item label={t('import.instance')}>
          <InputNumber min={0} value={index} onChange={(v) => setIndex(Number(v ?? 0))} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
