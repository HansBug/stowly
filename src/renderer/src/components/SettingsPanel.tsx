import { Alert, Button, Form, InputNumber, Select, Space, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { totalBinVolume, totalItemVolume, validateProject, type Objective, type OptimizationMode, type Project, type Settings, type Solver } from '../lib/project'

interface Props {
  project: Project
  solving: boolean
  onChange: (patch: Partial<Settings>) => void
  onSolve: () => void
}

export function SettingsPanel({ project, solving, onChange, onSolve }: Props) {
  const { t } = useTranslation()
  const problems = validateProject(project)
  const messages = Array.from(new Set(problems.map((p) => (p.startsWith('bad-dimension') || p.startsWith('bad-copies') ? 'bad' : p)))).map((key) => t(`settings.problems.${key}`))
  const items = totalItemVolume(project) / 1e9
  const bins = totalBinVolume(project) / 1e9
  return (
    <Form layout="vertical" size="small">
      <Form.Item label={t('settings.solver')} help={t('settings.solverHelp')}>
        <Select value={project.settings.solver} onChange={(solver: Solver) => onChange({ solver })} options={[{ value: 'box', label: 'box' }, { value: 'boxstacks', label: 'boxstacks' }]} />
      </Form.Item>
      <Form.Item label={t('settings.objective')} help={t(`settings.objectiveHelp.${project.settings.objective}`)}>
        <Select value={project.settings.objective} onChange={(objective: Objective) => onChange({ objective })}
          options={(['bin-packing', 'knapsack', 'variable-sized-bin-packing'] as Objective[]).map((o) => ({ value: o, label: t(`settings.objectives.${o}`) }))} />
      </Form.Item>
      <Space>
        <Form.Item label={t('settings.timeLimit')}>
          <InputNumber min={0.5} max={3600} step={1} value={project.settings.timeLimit} onChange={(v) => v !== null && onChange({ timeLimit: Number(v) })} />
        </Form.Item>
        <Form.Item label={t('settings.mode')}>
          <Select style={{ width: 240 }} value={project.settings.optimizationMode} onChange={(optimizationMode: OptimizationMode) => onChange({ optimizationMode })}
            options={(['anytime', 'not-anytime', 'not-anytime-deterministic', 'not-anytime-sequential'] as OptimizationMode[]).map((m) => ({ value: m, label: t(`settings.modes.${m}`) }))} />
        </Form.Item>
      </Space>
      <Typography.Paragraph type="secondary">{t('settings.summary', { items: items.toFixed(2), bins: bins.toFixed(2), ratio: bins > 0 ? ((items / bins) * 100).toFixed(0) : '-' })}</Typography.Paragraph>
      {messages.length ? <Alert type="warning" showIcon message={messages.join('；')} style={{ marginBottom: 12 }} /> : null}
      <Button type="primary" size="large" block loading={solving} disabled={problems.length > 0} onClick={onSolve} data-testid="solve-button">
        {solving ? t('settings.solving') : t('settings.solve')}
      </Button>
    </Form>
  )
}
