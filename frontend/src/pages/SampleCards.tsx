import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography } from '@mui/material'
import { GrainStripePreview } from '../components/common/GrainStripePreview'
import { RulerInput } from '../components/common/RulerInput'
import { StatBadge } from '../components/common/StatBadge'
import { useUnitConvert } from '../hooks/useUnitConvert'
import { useMouldStore } from '../stores/mouldStore'
import { useRunStore } from '../stores/runStore'
import { useSampleStore } from '../stores/sampleStore'
import { EVENNESS_LEVELS, type EvennessLevel, type PaperSampleInput } from '../types/paper-sample'
import { groupRuns, versionById, versionLabel } from '../utils/revisions'
import { isGapOutOfTolerance } from '../utils/stripe'

const emptySampleForm: PaperSampleInput = {
  sampleNo: '',
  runVersionId: null,
  sizeMm: 210,
  stripeCount: 45,
  evenness: '均匀',
  archiveBin: '待归档-01',
}

function stripeTier(count: number): { label: string; color: 'success' | 'info' | 'warning' } {
  if (count >= 50) return { label: '密纹档', color: 'success' }
  if (count >= 40) return { label: '中密档', color: 'info' }
  return { label: '疏纹档', color: 'warning' }
}

export default function SampleCards() {
  const samples = useSampleStore((state) => state.paperSamples)
  const error = useSampleStore((state) => state.error)
  const loadSamples = useSampleStore((state) => state.loadSamples)
  const addSample = useSampleStore((state) => state.addSample)
  const runs = useRunStore((state) => state.sheetRuns)
  const runError = useRunStore((state) => state.error)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const moulds = useMouldStore((state) => state.moulds)
  const mouldError = useMouldStore((state) => state.error)
  const loadMoulds = useMouldStore((state) => state.loadMoulds)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PaperSampleInput>(emptySampleForm)
  const [evennessFilter, setEvennessFilter] = useState<EvennessLevel | '全部'>('全部')
  const [stripeFloor, setStripeFloor] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const { mmToCm, formatGrammage } = useUnitConvert()

  useEffect(() => {
    void loadSamples()
    void loadRuns()
    void loadMoulds()
  }, [loadMoulds, loadRuns, loadSamples])

  const runVersionMap = useMemo(() => versionById(runs), [runs])
  const mouldById = useMemo(() => {
    const map = new Map<number, (typeof moulds)[number]>()
    for (const mould of moulds) {
      if (mould.id !== undefined) map.set(mould.id, mould)
    }
    return map
  }, [moulds])

  // 登记样本时只能选择各槽的最新有效版
  const currentVersionOptions = useMemo(
    () => groupRuns(runs).filter((group) => group.current && !group.conflicted).map((group) => group.current!),
    [runs],
  )

  const filteredSamples = useMemo(
    () => samples.filter((sample) => (evennessFilter === '全部' || sample.evenness === evennessFilter) && sample.stripeCount >= stripeFloor),
    [evennessFilter, samples, stripeFloor],
  )
  const denseCount = samples.filter((sample) => sample.stripeCount >= 50).length
  const recheckCount = samples.filter((sample) => sample.evenness !== '均匀').length

  const updateForm = <K extends keyof PaperSampleInput,>(key: K, value: PaperSampleInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.sampleNo.trim() || !form.archiveBin.trim() || form.sizeMm <= 0 || form.stripeCount <= 0 || form.runVersionId === null) return
    setSubmitting(true)
    const created = await addSample({ ...form, sampleNo: form.sampleNo.trim(), archiveBin: form.archiveBin.trim() })
    setSubmitting(false)
    if (created) {
      setForm(emptySampleForm)
      setShowForm(false)
    }
  }

  const errorMessage = error ?? runError ?? mouldError

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Typography component="h1" variant="h3" color="#344a34">成纸样本与透光检验卡</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            样本固定引用登记时的工序版本，不随后续复测更正漂移；作废版本的样本标明失效。
          </Typography>
        </Box>
        <Button variant="contained" size="large" onClick={() => setShowForm((current) => !current)} data-testid="new-sample">
          {showForm ? '收起登记' : '新建样本'}
        </Button>
      </Box>

      {errorMessage && <Alert severity="warning">{errorMessage}</Alert>}

      {showForm && (
        <Card data-testid="form-sample" sx={{ borderColor: '#9eb096' }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h5" sx={{ mb: 2 }}>登记成纸样本</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField fullWidth label="样本编号" value={form.sampleNo} onChange={(event) => updateForm('sampleNo', event.target.value)} inputProps={{ 'data-testid': 'field-sampleNo' }} /></Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  select
                  fullWidth
                  label="对应工序版本"
                  value={form.runVersionId ?? ''}
                  onChange={(event) => updateForm('runVersionId', event.target.value === '' ? null : Number(event.target.value))}
                  SelectProps={{ native: true, inputProps: { 'data-testid': 'field-runVersionId' } }}
                >
                  <option value="" disabled>选择工序版本</option>
                  {currentVersionOptions.map((version) => (
                    <option key={version.id} value={version.id}>{version.runNo} · {versionLabel(version)} · {version.runDate}</option>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={6} md={2}><TextField fullWidth type="number" label="样本尺寸" value={form.sizeMm} onChange={(event) => updateForm('sizeMm', Number(event.target.value))} inputProps={{ min: 20, max: 1000, step: 1, 'data-testid': 'field-sizeMm' }} InputProps={{ endAdornment: 'mm' }} /></Grid>
              <Grid item xs={6} md={3}><TextField fullWidth type="number" label="帘纹条数" value={form.stripeCount} onChange={(event) => updateForm('stripeCount', Number(event.target.value))} inputProps={{ min: 1, max: 300, step: 1, 'data-testid': 'field-stripeCount' }} /></Grid>
              <Grid item xs={6} md={3}>
                <TextField select fullWidth label="匀度" value={form.evenness} onChange={(event) => updateForm('evenness', event.target.value as EvennessLevel)} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-evenness' } }}>
                  {EVENNESS_LEVELS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={5}><TextField fullWidth label="存档位" value={form.archiveBin} onChange={(event) => updateForm('archiveBin', event.target.value)} inputProps={{ 'data-testid': 'field-archiveBin' }} /></Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2.5 }}>
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="contained" onClick={handleSubmit} disabled={submitting || form.runVersionId === null} data-testid="submit-sample">保存样本</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <StatBadge label="样本总数" value={samples.length} detail="档案柜入库数量" />
        <StatBadge label="密纹样本" value={denseCount} detail="帘纹条数不少于 50" tone="bamboo" />
        <StatBadge label="待复检" value={recheckCount} detail="匀度非“均匀”" tone={recheckCount ? 'warning' : 'neutral'} />
      </Box>

      <Card>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={5} md={3}>
              <TextField select fullWidth size="small" label="匀度筛选" value={evennessFilter} onChange={(event) => setEvennessFilter(event.target.value as EvennessLevel | '全部')} SelectProps={{ native: true }}>
                <option value="全部">全部匀度</option>
                {EVENNESS_LEVELS.map((option) => <option key={option} value={option}>{option}</option>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={7} md={4}>
              <RulerInput label="最低帘纹条数" value={stripeFloor} onChange={setStripeFloor} unit="条" min={0} max={300} step={1} compact />
            </Grid>
            <Grid item xs={6} md={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Typography variant="body2" color="text.secondary">当前记录</Typography><Typography variant="h5" data-testid="count-sample">{filteredSamples.length}</Typography></Box>
            </Grid>
            <Grid item xs={6} md={3}><Button fullWidth variant="outlined" onClick={() => { setEvennessFilter('全部'); setStripeFloor(0) }}>重置分档</Button></Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        {filteredSamples.map((sample) => {
          const version = sample.runVersionId === null ? undefined : runVersionMap.get(sample.runVersionId)
          const mould = version ? mouldById.get(version.mouldId) : undefined
          const tier = stripeTier(sample.stripeCount)
          const voided = version?.voided === true
          const gap = version?.measuredGap ?? mould?.stripeGap ?? 1
          const deviation = version && typeof version.deviation === 'number' ? version.deviation : null
          return (
            <Card
              key={sample.id ?? sample.sampleNo}
              data-testid="row-sample"
              sx={{
                bgcolor: voided ? '#f1ede4' : sample.evenness === '均匀' ? '#fffdf7' : '#fff9e8',
                opacity: voided ? 0.85 : 1,
                borderStyle: voided ? 'dashed' : undefined,
              }}
            >
              <CardContent sx={{ p: 2.25 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{sample.sampleNo}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      工序 {version?.runNo ?? '待关联'} · {version ? versionLabel(version) : '版本待补'} · {version?.runDate ?? '日期待补'}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="flex-end">
                    {voided && <Chip size="small" color="default" label="失效" />}
                    <Chip size="small" color={tier.color} label={tier.label} />
                  </Stack>
                </Box>
                {voided && (
                  <Alert severity="warning" sx={{ mb: 1.5 }}>
                    该样本引用的工序版本已作废（{version?.voidReason || '作废原因未填'}），样本记录仍保留，偏差不再计入复检统计。
                  </Alert>
                )}
                <GrainStripePreview
                  gap={gap}
                  wireDiameter={mould?.wireDiameter ?? 0.25}
                  density={mould?.meshDensity}
                  stripeCount={sample.stripeCount}
                  direction={version?.stripeDirection === '横帘纹' ? 'horizontal' : 'vertical'}
                />
                <Grid container spacing={1} sx={{ mt: 1 }}>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">帘纹条数</Typography><Typography sx={{ fontWeight: 700 }}>{sample.stripeCount} 条</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">匀度</Typography><Typography sx={{ fontWeight: 700, color: sample.evenness === '均匀' ? 'success.dark' : 'warning.dark' }}>{sample.evenness}</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">样本尺寸</Typography><Typography>{sample.sizeMm} mm · {mmToCm(sample.sizeMm)} cm</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">纸页克重</Typography><Typography>{version ? formatGrammage(version.grammage) : '待补'}</Typography></Grid>
                </Grid>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', mt: 1.5 }}>
                  <Chip size="small" variant="outlined" label={`存档 ${sample.archiveBin}`} />
                  {deviation !== null && !voided && isGapOutOfTolerance(deviation) && (
                    <Chip size="small" color="warning" label={`偏差 ${deviation > 0 ? '+' : ''}${deviation.toFixed(2)} mm`} />
                  )}
                  {voided && <Chip size="small" variant="outlined" label="引用版本已作废" />}
                </Box>
              </CardContent>
            </Card>
          )
        })}
        {filteredSamples.length === 0 && (
          <Card sx={{ gridColumn: '1 / -1' }}><CardContent sx={{ textAlign: 'center', py: 7 }}><Typography color="text.secondary">没有符合当前匀度与帘纹条数分档的样本</Typography></CardContent></Card>
        )}
      </Box>
    </Stack>
  )
}
