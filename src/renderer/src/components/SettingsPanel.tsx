import { Alert, Button, Form, InputNumber, Segmented, Select, Space, Tooltip, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import type { Budget } from '../lib/api'
import { totalBinVolume, totalItemVolume, UNLOADING_CONSTRAINTS, validateProject, type Objective, type OptimizationMode, type Project, type Settings, type Solver, type TimeMode, type UnloadingConstraint } from '../lib/project'
import type { Calibration } from '../store/project'

interface Props {
  project: Project
  solving: boolean
  /** The budget the backend would solve this project with; null while unknown. */
  recommendation: Budget | null
  calibration: Calibration
  onChange: (patch: Partial<Settings>) => void
  onSolve: () => void
  onResetCalibration: () => void
}

/** Coarse quality-versus-waiting choices offered instead of a bare alpha number. */
const PREFERENCES: { key: string; alpha: number | undefined }[] = [
  { key: 'default', alpha: undefined },
  { key: 'fast', alpha: 2 },
  { key: 'balanced', alpha: 4 },
  { key: 'thorough', alpha: 8 }
]
const TIME_CAP = 600

const round1 = (value: number): number => Math.round(value * 10) / 10

export function SettingsPanel({ project, solving, recommendation, calibration, onChange, onSolve, onResetCalibration }: Props) {
  const { t } = useTranslation()
  const settings = project.settings
  const problems = validateProject(project)
  const messages = Array.from(new Set(problems.map((p) => (p.startsWith('bad-dimension') || p.startsWith('bad-copies') ? 'bad' : p)))).map((key) => t(`settings.problems.${key}`))
  const items = totalItemVolume(project) / 1e9
  const bins = totalBinVolume(project) / 1e9
  const stacked = settings.solver === 'boxstacks'
  const manual = settings.timeMode === 'manual'
  const preference = PREFERENCES.find((p) => p.alpha === settings.alpha)?.key ?? 'default'

  /** The manual fields as pre-filled from a recommendation: rounded, undefined where the recommendation has no value. */
  const fromRecommendation = (r: Budget) => ({
    timeLimit: round1(r.timeLimit),
    stopWhenUnimprovedFor: r.stopWhenUnimprovedFor == null ? undefined : round1(r.stopWhenUnimprovedFor),
    stopWhenUnimprovedAfter: r.stopWhenUnimprovedAfter == null ? undefined : round1(r.stopWhenUnimprovedAfter),
    stopWhenUnimprovedRatio: r.stopWhenUnimprovedRatio == null ? undefined : round1(r.stopWhenUnimprovedRatio)
  })
  /** Switching to manual mode starts from the recommendation, so the fields never open on stale or empty values. */
  const setTimeMode = (timeMode: TimeMode) => {
    if (timeMode === 'manual' && recommendation) onChange({ timeMode, ...fromRecommendation(recommendation) })
    else onChange({ timeMode })
  }
  const useRecommended = () => {
    if (recommendation) onChange(fromRecommendation(recommendation))
  }

  const recommendationText = recommendation
    ? t('settings.recommendation', {
        latency: recommendation.latency.toFixed(1), timeLimit: recommendation.timeLimit.toFixed(0),
        ratio: (recommendation.stopWhenUnimprovedRatio ?? 0).toFixed(1), patience: (recommendation.stopWhenUnimprovedFor ?? 0).toFixed(0), after: (recommendation.stopWhenUnimprovedAfter ?? 0).toFixed(1)
      })
    : project.bins.length && project.items.length ? t('settings.recommendationPending') : t('settings.recommendationUnavailable')

  return (
    <Form layout="vertical" size="small">
      <Form.Item label={t('settings.solver')} help={t('settings.solverHelp')}>
        <Select value={settings.solver} onChange={(solver: Solver) => onChange({ solver })} options={[{ value: 'box', label: 'box' }, { value: 'boxstacks', label: 'boxstacks' }]} />
      </Form.Item>
      {stacked && project.items.some((item) => item.rotations === 'all') ? <Alert type="info" showIcon message={t('items.stackingUpright')} style={{ marginBottom: 12 }} data-testid="upright-note" /> : null}
      <Form.Item label={t('settings.objective')} help={t(`settings.objectiveHelp.${settings.objective}`)}>
        <Select value={settings.objective} onChange={(objective: Objective) => onChange({ objective })}
          options={(['bin-packing', 'knapsack', 'variable-sized-bin-packing'] as Objective[]).map((o) => ({ value: o, label: t(`settings.objectives.${o}`) }))} />
      </Form.Item>
      <Form.Item label={t('settings.time')} help={manual ? t('settings.manualHint') : t('settings.timeAutoHint')}>
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          <Segmented data-testid="time-mode" value={settings.timeMode} onChange={(value) => setTimeMode(value as TimeMode)}
            options={[{ value: 'auto', label: t('settings.timeAuto') }, { value: 'manual', label: t('settings.timeManual') }]} />
          <Space wrap>
            <Typography.Text type="secondary">{t('settings.preference')}</Typography.Text>
            <Segmented data-testid="preference" size="small" value={preference} onChange={(value) => onChange({ alpha: PREFERENCES.find((p) => p.key === value)?.alpha })}
              options={PREFERENCES.map((p) => ({ value: p.key, label: t(`settings.preferences.${p.key}`) }))} />
          </Space>
          <Typography.Text type={recommendation ? undefined : 'secondary'} data-testid="recommendation">
            {recommendationText}{recommendation ? `（${t('settings.recommendationPath', { path: recommendation.path })}）` : ''}
          </Typography.Text>
          {recommendation && stacked && recommendation.path === 'SVC' ? <Alert type="warning" showIcon message={t('settings.svcWarning')} data-testid="svc-warning" /> : null}
          {recommendation && recommendation.timeLimit >= TIME_CAP ? <Alert type="warning" showIcon message={t('settings.capWarning')} data-testid="cap-warning" /> : null}
        </Space>
      </Form.Item>
      {manual ? (
        <div data-testid="manual-time" style={{ marginBottom: 12 }}>
          <Space wrap align="start" size={[16, 4]}>
            <Form.Item label={t('settings.timeLimit')} style={{ marginBottom: 4 }}>
              <InputNumber data-testid="time-limit" style={{ width: 120 }} min={0.5} max={3600} step={1} value={settings.timeLimit} onChange={(v) => v !== null && onChange({ timeLimit: Number(v) })} />
            </Form.Item>
            <Form.Item label={t('settings.stopFor')} style={{ marginBottom: 4 }}>
              <InputNumber data-testid="stop-for" style={{ width: 120 }} min={0.5} max={3600} step={0.5} value={settings.stopWhenUnimprovedFor ?? null} onChange={(v) => onChange({ stopWhenUnimprovedFor: v === null ? undefined : Number(v) })} />
            </Form.Item>
            <Form.Item label={t('settings.stopAfter')} style={{ marginBottom: 4 }}>
              <InputNumber data-testid="stop-after" style={{ width: 120 }} min={0} max={3600} step={0.5} value={settings.stopWhenUnimprovedAfter ?? null} onChange={(v) => onChange({ stopWhenUnimprovedAfter: v === null ? undefined : Number(v) })} />
            </Form.Item>
            <Form.Item label={t('settings.stopRatio')} style={{ marginBottom: 4 }}>
              <InputNumber data-testid="stop-ratio" style={{ width: 120 }} min={0.5} max={10} step={0.5} value={settings.stopWhenUnimprovedRatio ?? null} onChange={(v) => onChange({ stopWhenUnimprovedRatio: v === null ? undefined : Number(v) })} />
            </Form.Item>
          </Space>
          <Space wrap size={[12, 0]} style={{ marginTop: 4 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('settings.stopOff')}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('settings.stopRatioHelp')}</Typography.Text>
            <Button size="small" onClick={useRecommended} disabled={!recommendation} data-testid="use-recommended">{t('settings.useRecommended')}</Button>
          </Space>
        </div>
      ) : null}
      <Form.Item label={t('settings.mode')}>
        <Select style={{ width: 240 }} value={settings.optimizationMode} onChange={(optimizationMode: OptimizationMode) => onChange({ optimizationMode })}
          options={(['anytime', 'not-anytime', 'not-anytime-deterministic', 'not-anytime-sequential'] as OptimizationMode[]).map((m) => ({ value: m, label: t(`settings.modes.${m}`) }))} />
      </Form.Item>
      <Form.Item label={t('settings.unloading')} help={stacked ? t('settings.unloadingHelp') : t('settings.unloadingBoxOnly')}>
        <Tooltip title={stacked ? undefined : t('settings.unloadingBoxOnly')}>
          <Select data-testid="unloading-select" disabled={!stacked} value={settings.unloadingConstraint} onChange={(unloadingConstraint: UnloadingConstraint) => onChange({ unloadingConstraint })}
            options={UNLOADING_CONSTRAINTS.map((c) => ({ value: c, label: t(`settings.unloadingOptions.${c}`) }))} />
        </Tooltip>
      </Form.Item>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>{t('settings.summary', { items: items.toFixed(2), bins: bins.toFixed(2), ratio: bins > 0 ? ((items / bins) * 100).toFixed(0) : '-' })}</Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }} data-testid="calibration">
        {calibration.samples > 0 ? t('settings.calibration', { speed: calibration.speed.toFixed(2), samples: calibration.samples }) : t('settings.calibrationNone')}
        {calibration.samples > 0 ? <Button type="link" size="small" onClick={onResetCalibration}>{t('settings.calibrationReset')}</Button> : null}
      </Typography.Paragraph>
      {messages.length ? <Alert type="warning" showIcon message={messages.join('；')} style={{ marginBottom: 12 }} /> : null}
      <Button type="primary" size="large" block loading={solving} disabled={problems.length > 0} onClick={onSolve} data-testid="solve-button">
        {solving ? t('settings.solving') : t('settings.solve')}
      </Button>
    </Form>
  )
}
