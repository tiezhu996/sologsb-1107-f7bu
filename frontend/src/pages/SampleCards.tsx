import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography } from '@mui/material'
import { GrainStripePreview } from '../components/common/GrainStripePreview'
import { RulerInput } from '../components/common/RulerInput'
import { StatBadge } from '../components/common/StatBadge'
import { useUnitConvert } from '../hooks/useUnitConvert'
import { useMouldStore } from '../stores/mouldStore'
import { useRunChains, useRunStore } from '../stores/runStore'
import { useSampleStore } from '../stores/sampleStore'
import { EVENNESS_LEVELS, type EvennessLevel, type PaperSampleInput } from '../types/paper-sample'
import type { SheetRun } from '../types/sheet-run'
import { isGapOutOfTolerance } from '../utils/stripe'
import { findReferencedRun, isSampleStale, latestActiveVersion, referencedVersionId, resolveSampleRunState, type SampleRunState, standardGapOf } from '../utils/runChain'

const emptySampleForm: PaperSampleInput = {
  sampleNo: '',
  runId: 1,
  runVersionId: 1,
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

const stateLabel: Record<SampleRunState, string> = {
  active: '引用有效版',
  superseded: '引用历史版',
  void: '已失效·工序作废',
  conflict: '已失效·并列有效版',
  missing: '已失效·工序缺失',
}

export default function SampleCards() {
  const samples = useSampleStore((state) => state.paperSamples)
  const error = useSampleStore((state) => state.error)
  const loadSamples = useSampleStore((state) => state.loadSamples)
  const addSample = useSampleStore((state) => state.addSample)
  const runError = useRunStore((state) => state.error)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const chains = useRunChains()
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

  const mouldById = useMemo(() => new Map(moulds.map((mould) => [mould.id, mould])), [moulds])

  // 新建样本只能挂到每槽最新有效版上
  const selectableRuns = useMemo<SheetRun[]>(
    () => chains.map(latestActiveVersion).filter((run): run is SheetRun => run !== null),
    [chains],
  )

  const sampleStateById = useMemo(() => {
    const map = new Map<number, SampleRunState>()
    for (const sample of samples) {
      if (sample.id !== undefined) map.set(sample.id, resolveSampleRunState(sample, chains))
    }
    return map
  }, [chains, samples])

  const filteredSamples = useMemo(
    () => samples.filter((sample) => (evennessFilter === '全部' || sample.evenness === evennessFilter) && sample.stripeCount >= stripeFloor),
    [evennessFilter, samples, stripeFloor],
  )
  const denseCount = samples.filter((sample) => sample.stripeCount >= 50).length
  const staleCount = samples.filter((sample) => {
    const state = sample.id !== undefined ? sampleStateById.get(sample.id) : undefined
    return state ? isSampleStale(state) : false
  }).length
  // 待复检只统计引用版本仍为最新有效版的样本；历史版/作废样本不再驱动当前业务
  const recheckCount = samples.filter((sample) => {
    if (sample.evenness === '均匀') return false
    return sampleStateById.get(sample.id ?? -1) === 'active'
  }).length

  const updateForm = <K extends keyof PaperSampleInput,>(key: K, value: PaperSampleInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleRunChange = (versionId: number) => {
    setForm((current) => ({ ...current, runId: versionId, runVersionId: versionId }))
  }

  const handleSubmit = async () => {
    if (!form.sampleNo.trim() || !form.archiveBin.trim() || form.sizeMm <= 0 || form.stripeCount <= 0) return
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
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>样本固定引用登记当时那版工序；工序作废或出现并列有效版时卡片标明失效，历史版本只作留存展示。</Typography>
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
                <TextField select fullWidth label="对应工序（最新有效版）" value={referencedVersionId(form)} onChange={(event) => handleRunChange(Number(event.target.value))} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-runId' } }}>
                  {selectableRuns.length === 0 && <option value={form.runId}>暂无有效工序，请先登记</option>}
                  {selectableRuns.map((run) => <option key={run.id} value={run.id}>{run.runNo} · 第 {run.versionNo ?? 1} 版 · {run.runDate}</option>)}
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
              <Button variant="contained" onClick={handleSubmit} disabled={submitting || selectableRuns.length === 0} data-testid="submit-sample">保存样本</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <StatBadge label="样本总数" value={samples.length} detail="档案柜入库数量（含历史引用）" />
        <StatBadge label="密纹样本" value={denseCount} detail="帘纹条数不少于 50" tone="bamboo" />
        <StatBadge label="待复检" value={recheckCount} detail="仅统计引用最新有效版的样本" tone={recheckCount ? 'warning' : 'neutral'} />
        <StatBadge label="已失效" value={staleCount} detail="工序作废、缺失或并列有效" tone={staleCount ? 'warning' : 'neutral'} />
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
          const run = findReferencedRun(sample, chains)
          const mould = run ? mouldById.get(run.mouldId) : undefined
          const state = sample.id !== undefined ? sampleStateById.get(sample.id) ?? 'missing' : 'missing'
          const stale = isSampleStale(state)
          const historical = state === 'superseded'
          const tier = stripeTier(sample.stripeCount)
          const standardGap = run ? standardGapOf(run, mould?.stripeGap) : 1
          const gap = run?.measuredGap ?? mould?.stripeGap ?? 1
          const deviation = run ? run.measuredGap - standardGap : 0
          return (
            <Card
              key={sample.id ?? sample.sampleNo}
              data-testid="row-sample"
              sx={{
                bgcolor: stale ? '#f4f4f2' : sample.evenness === '均匀' ? '#fffdf7' : '#fff9e8',
                borderColor: stale ? '#cfc9bf' : undefined,
                opacity: stale ? 0.92 : 1,
              }}
            >
              <CardContent sx={{ p: 2.25 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{sample.sampleNo}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      工序 {run?.runNo ?? '待关联'} · 第 {run?.versionNo ?? 1} 版 · {run?.runDate ?? '日期待补'}
                    </Typography>
                  </Box>
                  <Stack spacing={0.5} alignItems="flex-end">
                    <Chip size="small" color={tier.color} label={tier.label} />
                    {stale
                      ? <Chip size="small" color="error" variant="outlined" label="失效" data-testid="sample-stale" />
                      : historical
                        ? <Chip size="small" variant="outlined" label={stateLabel[state]} />
                        : <Chip size="small" color="success" variant="outlined" label={stateLabel[state]} />}
                  </Stack>
                </Box>
                <GrainStripePreview
                  gap={gap}
                  wireDiameter={run?.wireDiameterSnapshot ?? mould?.wireDiameter ?? 0.25}
                  density={run?.meshDensitySnapshot ?? mould?.meshDensity}
                  stripeCount={sample.stripeCount}
                  direction={run?.stripeDirection === '横帘纹' ? 'horizontal' : 'vertical'}
                />
                <Grid container spacing={1} sx={{ mt: 1 }}>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">帘纹条数</Typography><Typography sx={{ fontWeight: 700 }}>{sample.stripeCount} 条</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">匀度</Typography><Typography sx={{ fontWeight: 700, color: sample.evenness === '均匀' ? 'success.dark' : 'warning.dark' }}>{sample.evenness}</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">样本尺寸</Typography><Typography>{sample.sizeMm} mm · {mmToCm(sample.sizeMm)} cm</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">纸页克重</Typography><Typography>{run ? formatGrammage(run.grammage) : '待补'}</Typography></Grid>
                </Grid>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', mt: 1.5, flexWrap: 'wrap' }}>
                  <Chip size="small" variant="outlined" label={`存档 ${sample.archiveBin}`} />
                  {run && isGapOutOfTolerance(deviation) && <Chip size="small" color="warning" label={`偏差 ${deviation > 0 ? '+' : ''}${deviation.toFixed(2)} mm`} />}
                  {stale && <Typography variant="caption" color="error.dark" data-testid="sample-stale-reason">{stateLabel[state]}，仅作留存</Typography>}
                  {historical && <Typography variant="caption" color="text.secondary">引用版本已被更正，数据保持登记当时值</Typography>}
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
