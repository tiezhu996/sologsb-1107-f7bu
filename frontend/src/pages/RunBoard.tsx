import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { ProcessTimeline, type ProcessStep } from '../components/common/ProcessTimeline'
import { RulerInput } from '../components/common/RulerInput'
import { useUnitConvert } from '../hooks/useUnitConvert'
import { useFiberStore } from '../stores/fiberStore'
import { useMouldStore } from '../stores/mouldStore'
import { useRunStore } from '../stores/runStore'
import { DRY_METHODS, STRIPE_DIRECTIONS, type DryMethod, type SheetRun, type SheetRunInput, type StripeDirection } from '../types/sheet-run'
import { getGapConclusion, isGapOutOfTolerance } from '../utils/stripe'
import { groupRuns, type RunGroup } from '../utils/revisions'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const emptyRunForm: SheetRunInput = {
  runNo: '',
  mouldId: 1,
  batchId: 1,
  runDate: todayIso(),
  operator: '罗青禾',
  stripeDirection: '竖帘纹',
  dipCount: 2,
  stackHeight: 42,
  dryMethod: '火墙',
  grammage: 32,
  measuredGap: 1.1,
  deviation: 0,
}

const processSteps: ProcessStep[] = [
  { label: '浆料复核', detail: '核对料批打浆度与漂洗状态。', status: 'done' },
  { label: '帘床就位', detail: '确认纸帘方向与框架张力。', status: 'done' },
  { label: '入槽抄纸', detail: '按设定次数完成荡料与提帘。', status: 'active' },
  { label: '压榨定形', detail: '控制叠高后转火墙或日晒。', status: 'pending' },
  { label: '量纹偏差', detail: '实测间距并与纸帘标准值比较。', status: 'pending' },
]

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`
}

export default function RunBoard() {
  const runs = useRunStore((state) => state.sheetRuns)
  const runError = useRunStore((state) => state.error)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const addRun = useRunStore((state) => state.addRun)
  const reviseRun = useRunStore((state) => state.reviseRun)
  const voidRunVersion = useRunStore((state) => state.voidRunVersion)
  const moulds = useMouldStore((state) => state.moulds)
  const mouldError = useMouldStore((state) => state.error)
  const loadMoulds = useMouldStore((state) => state.loadMoulds)
  const batches = useFiberStore((state) => state.fiberBatches)
  const batchError = useFiberStore((state) => state.error)
  const loadBatches = useFiberStore((state) => state.loadFiberBatches)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<SheetRunInput>(emptyRunForm)
  const [dateFilter, setDateFilter] = useState('')
  const [mouldFilter, setMouldFilter] = useState('全部')
  const [submitting, setSubmitting] = useState(false)
  const [expandedRunNo, setExpandedRunNo] = useState<string | null>(null)
  const [reviseTarget, setReviseTarget] = useState<SheetRun | null>(null)
  const [reviseGap, setReviseGap] = useState(0)
  const [reviseReason, setReviseReason] = useState('')
  const [voidTarget, setVoidTarget] = useState<SheetRun | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [dialogError, setDialogError] = useState('')
  const { formatGrammage, cmToMm } = useUnitConvert()

  useEffect(() => {
    void loadRuns()
    void loadMoulds()
    void loadBatches()
  }, [loadBatches, loadMoulds, loadRuns])

  const mouldById = useMemo(() => {
    const map = new Map<number, (typeof moulds)[number]>()
    for (const mould of moulds) {
      if (mould.id !== undefined) map.set(mould.id, mould)
    }
    return map
  }, [moulds])
  const batchById = useMemo(() => {
    const map = new Map<number, (typeof batches)[number]>()
    for (const batch of batches) {
      if (batch.id !== undefined) map.set(batch.id, batch)
    }
    return map
  }, [batches])

  const groups = useMemo(() => groupRuns(runs), [runs])

  const filteredGroups = useMemo(
    () => groups.filter((group) => {
      // 冲突 / 全部作废的槽始终列出，便于指出并处理
      if (!group.current) return true
      const mould = mouldById.get(group.current.mouldId)
      const matchesDate = !dateFilter || group.current.runDate === dateFilter
      const matchesMould = mouldFilter === '全部' || mould?.mouldNo === mouldFilter
      return matchesDate && matchesMould
    }),
    [dateFilter, mouldById, mouldFilter, groups],
  )

  const conflictGroups = useMemo(() => groups.filter((group) => group.conflicted), [groups])
  const activeCount = useMemo(
    () => groups.filter((group) => group.current && (!dateFilter || group.current.runDate === dateFilter) && (mouldFilter === '全部' || mouldById.get(group.current.mouldId)?.mouldNo === mouldFilter)).length,
    [dateFilter, mouldById, mouldFilter, groups],
  )

  const selectedMould = mouldById.get(form.mouldId) ?? moulds[0]
  const formDeviation = selectedMould ? form.measuredGap - selectedMould.stripeGap : form.measuredGap
  const latestGroup = useMemo(() => {
    const active = groups.filter((group) => group.current)
    active.sort((a, b) => (b.current?.runDate ?? '').localeCompare(a.current?.runDate ?? ''))
    return active[0] ?? null
  }, [groups])
  const latestRun = latestGroup?.current ?? null

  const updateForm = <K extends keyof SheetRunInput,>(key: K, value: SheetRunInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleMouldChange = (mouldId: number) => {
    setForm((current) => {
      const mould = mouldById.get(mouldId)
      const standardGap = mould?.stripeGap ?? current.measuredGap
      return { ...current, mouldId, measuredGap: standardGap, deviation: 0 }
    })
  }

  const handleSubmit = async () => {
    if (!form.runNo.trim() || !form.operator.trim() || form.measuredGap <= 0 || form.grammage <= 0) return
    setSubmitting(true)
    const created = await addRun({ ...form, runNo: form.runNo.trim(), operator: form.operator.trim(), deviation: formDeviation }, selectedMould)
    setSubmitting(false)
    if (created) {
      setForm(emptyRunForm)
      setShowForm(false)
    }
  }

  const openRevise = (version: SheetRun) => {
    setReviseTarget(version)
    setReviseGap(version.measuredGap)
    setReviseReason('')
    setDialogError('')
  }

  const handleRevise = async () => {
    if (!reviseTarget || reviseTarget.id === undefined) return
    if (!reviseReason.trim()) {
      setDialogError('请填写更正原因，历史版本将保留并标注原因')
      return
    }
    const mould = mouldById.get(reviseTarget.mouldId)
    const created = await reviseRun(reviseTarget.id, reviseGap, reviseReason, mould)
    if (created) {
      setReviseTarget(null)
      setExpandedRunNo(created.runNo)
    } else {
      setDialogError(runError ?? '复测更正失败')
    }
  }

  const openVoid = (version: SheetRun) => {
    setVoidTarget(version)
    setVoidReason('')
    setDialogError('')
  }

  const handleVoid = async () => {
    if (!voidTarget || voidTarget.id === undefined) return
    if (!voidReason.trim()) {
      setDialogError('请填写作废原因')
      return
    }
    await voidRunVersion(voidTarget.id, voidReason)
    setVoidTarget(null)
  }

  const error = runError ?? mouldError ?? batchError

  const renderVersionRow = (group: RunGroup, version: SheetRun) => {
    const mould = mouldById.get(version.mouldId)
    const batch = batchById.get(version.batchId)
    const isCurrent = group.current?.id === version.id
    const deviation = typeof version.deviation === 'number' ? version.deviation : null
    const deviationText = deviation === null ? '—' : `${deviation > 0 ? '+' : ''}${deviation.toFixed(2)} mm`
    return (
      <TableRow key={version.id ?? `${version.runNo}-${version.versionNo}`} sx={{ bgcolor: version.voided ? '#f1ede4' : isCurrent ? '#f4f7ef' : undefined }}>
        <TableCell>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
            <Typography sx={{ fontWeight: isCurrent ? 750 : 600 }}>v{version.versionNo ?? 1}</Typography>
            {isCurrent && <Chip size="small" color="success" label="最新有效版" />}
            {(version.versionNo ?? 1) === 1 && <Chip size="small" variant="outlined" label="基线版" />}
            {version.voided && <Chip size="small" color="default" label="已作废" />}
          </Stack>
          <Typography variant="caption" color="text.secondary">{version.reason || '未记录原因'}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2">{mould?.mouldNo ?? '纸帘待补'}</Typography>
          <Typography variant="caption" color="text.secondary">{batch?.batchNo ?? '料批待补'}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2">实测 {Number.isFinite(version.measuredGap) ? `${version.measuredGap.toFixed(2)} mm` : '—'}</Typography>
          <Typography variant="caption" color="text.secondary">
            标准 {version.standardGap === null || version.standardGap === undefined ? '—' : `${version.standardGap.toFixed(2)} mm`}（制版快照）
          </Typography>
        </TableCell>
        <TableCell>
          <Chip
            size="small"
            color={deviation === null ? 'default' : isGapOutOfTolerance(deviation) ? 'warning' : 'default'}
            variant={deviation === null || isGapOutOfTolerance(deviation) ? 'filled' : 'outlined'}
            label={deviationText}
          />
        </TableCell>
        <TableCell>
          <Typography variant="caption" color="text.secondary">{version.runDate} · {version.operator}</Typography>
        </TableCell>
        <TableCell>
          {version.voided ? (
            <Box>
              <Typography variant="caption" color="text.secondary">作废：{version.voidReason || '未填原因'}</Typography>
              <Typography variant="caption" display="block" color="text.secondary">{formatDateTime(version.voidedAt)}</Typography>
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary">更正于 {formatDateTime(version.revisedAt)}</Typography>
          )}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Typography component="h1" variant="h3" color="#344a34">抄纸工序记录台</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            每槽工序保留修订链：复测更正生成新版并写明原因，样本固定引用当时版本，作废版本留档可查。
          </Typography>
        </Box>
        <Button variant="contained" size="large" onClick={() => setShowForm((current) => !current)} data-testid="new-run">
          {showForm ? '收起登记' : '新建工序'}
        </Button>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      {conflictGroups.length > 0 && (
        <Alert severity="warning" data-testid="conflict-alert">
          有 {conflictGroups.length} 槽工序存在两个并列有效版本（{conflictGroups.map((group) => group.runNo).join('、')}），已停止计入统计，请核对后作废多余版本。
        </Alert>
      )}

      {showForm && (
        <Card data-testid="form-run" sx={{ borderColor: '#9eb096' }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography variant="h5">登记抄纸工序</Typography>
              <Chip color={isGapOutOfTolerance(formDeviation) ? 'warning' : 'success'} label={`偏差 ${formDeviation > 0 ? '+' : ''}${formDeviation.toFixed(2)} mm`} />
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField fullWidth label="工序编号" value={form.runNo} onChange={(event) => updateForm('runNo', event.target.value)} inputProps={{ 'data-testid': 'field-runNo' }} /></Grid>
              <Grid item xs={6} md={2.5}>
                <TextField select fullWidth label="纸帘" value={form.mouldId} onChange={(event) => handleMouldChange(Number(event.target.value))} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-mouldId' } }}>
                  {!moulds.some((mould) => mould.id === form.mouldId) && <option value={form.mouldId}>纸帘数据载入中</option>}
                  {moulds.filter((mould) => mould.state !== '退役').map((mould) => <option key={mould.id} value={mould.id}>{mould.mouldNo} · {mould.stripeGap} mm</option>)}
                </TextField>
              </Grid>
              <Grid item xs={6} md={2.5}>
                <TextField select fullWidth label="纤维料批" value={form.batchId} onChange={(event) => updateForm('batchId', Number(event.target.value))} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-batchId' } }}>
                  {!batches.some((batch) => batch.id === form.batchId) && <option value={form.batchId}>料批数据载入中</option>}
                  {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNo} · {batch.material}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={2}><TextField fullWidth type="date" label="抄纸日期" value={form.runDate} onChange={(event) => updateForm('runDate', event.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ 'data-testid': 'field-runDate' }} /></Grid>
              <Grid item xs={12} md={2}><TextField fullWidth label="操作人" value={form.operator} onChange={(event) => updateForm('operator', event.target.value)} inputProps={{ 'data-testid': 'field-operator' }} /></Grid>
              <Grid item xs={6} md={2}>
                <TextField select fullWidth label="帘纹方向" value={form.stripeDirection} onChange={(event) => updateForm('stripeDirection', event.target.value as StripeDirection)} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-stripeDirection' } }}>
                  {STRIPE_DIRECTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={6} md={2}><TextField fullWidth type="number" label="荡料次数" value={form.dipCount} onChange={(event) => updateForm('dipCount', Number(event.target.value))} inputProps={{ min: 1, max: 8, step: 1, 'data-testid': 'field-dipCount' }} /></Grid>
              <Grid item xs={6} md={2}><TextField fullWidth type="number" label="叠高" value={form.stackHeight} onChange={(event) => updateForm('stackHeight', Number(event.target.value))} inputProps={{ min: 10, max: 120, step: 1, 'data-testid': 'field-stackHeight' }} InputProps={{ endAdornment: '张' }} /></Grid>
              <Grid item xs={6} md={2}>
                <TextField select fullWidth label="干燥方式" value={form.dryMethod} onChange={(event) => updateForm('dryMethod', event.target.value as DryMethod)} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-dryMethod' } }}>
                  {DRY_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={6} md={2}><TextField fullWidth type="number" label="克重" value={form.grammage} onChange={(event) => updateForm('grammage', Number(event.target.value))} inputProps={{ min: 10, max: 200, step: 1, 'data-testid': 'field-grammage' }} InputProps={{ endAdornment: 'g/m²' }} /></Grid>
              <Grid item xs={12} md={4}>
                <RulerInput label="实测帘纹间距" value={form.measuredGap} onChange={(value) => updateForm('measuredGap', value)} min={0.1} max={5} step={0.01} testId="field-measuredGap" helperText={`${getGapConclusion(formDeviation)}，允许偏差 ±0.2 mm`} />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2.5 }}>
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="contained" onClick={handleSubmit} disabled={submitting} data-testid="submit-run">保存工序</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5 }}>最近一槽的工序进程</Typography>
              {latestRun ? (
                <>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                    <Chip size="small" label={latestRun.runNo} />
                    <Chip size="small" variant="outlined" label={formatGrammage(latestRun.grammage)} />
                  </Box>
                  <ProcessTimeline steps={processSteps} compact />
                </>
              ) : (
                <Typography color="text.secondary">等待工序数据。</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Grid container spacing={1.5} alignItems="center">
                <Grid item xs={12} sm={5} md={4}><TextField fullWidth size="small" type="date" label="按日期筛选" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                <Grid item xs={8} sm={5} md={4}>
                  <TextField select fullWidth size="small" label="按帘号筛选" value={mouldFilter} onChange={(event) => setMouldFilter(event.target.value)} SelectProps={{ native: true }}>
                    <option value="全部">全部纸帘</option>
                    {moulds.map((mould) => <option key={mould.id} value={mould.mouldNo}>{mould.mouldNo}</option>)}
                  </TextField>
                </Grid>
                <Grid item xs={4} md={2}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">有效工序</Typography>
                    <Typography variant="h5" data-testid="count-run">{activeCount}</Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={2}><Button fullWidth variant="outlined" onClick={() => { setDateFilter(''); setMouldFilter('全部') }}>重置</Button></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <TableContainer component={Card}>
        <Table sx={{ minWidth: 1080 }}>
          <TableHead>
            <TableRow>
              <TableCell>工序 / 日期</TableCell>
              <TableCell>纸帘与料批</TableCell>
              <TableCell>抄纸参数</TableCell>
              <TableCell align="right">克重</TableCell>
              <TableCell>实测间距与偏差</TableCell>
              <TableCell align="right">版本操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredGroups.map((group) => {
              const run = group.current
              const mould = run ? mouldById.get(run.mouldId) : undefined
              const batch = run ? batchById.get(run.batchId) : undefined
              const deviation = run && typeof run.deviation === 'number' ? run.deviation : null
              const exceeded = deviation !== null && isGapOutOfTolerance(deviation)
              const expanded = expandedRunNo === group.runNo
              return (
                <FragmentGroup
                  key={group.runNo}
                  group={group}
                  expanded={expanded}
                  exceeded={exceeded}
                  mouldNo={mould?.mouldNo}
                  batchNo={batch?.batchNo}
                  batchMaterial={batch?.material}
                  frameW={mould?.frameW}
                  frameH={mould?.frameH}
                  cmToMm={cmToMm}
                  deviation={deviation}
                  onToggle={() => setExpandedRunNo(expanded ? null : group.runNo)}
                  onRevise={openRevise}
                  onVoid={openVoid}
                  renderVersionRow={renderVersionRow}
                />
              )
            })}
            {filteredGroups.length === 0 && (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}>没有符合日期与帘号条件的工序</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 复测更正 */}
      <Dialog open={reviseTarget !== null} onClose={() => setReviseTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>复测更正 · {reviseTarget?.runNo}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Alert severity="info">
              更正将保留当前版本（v{reviseTarget?.versionNo ?? 1}）为历史记录并生成新版本，样本仍固定引用其登记时的版本。
              标准间距取用纸帘当前值 {reviseTarget ? mouldById.get(reviseTarget.mouldId)?.stripeGap.toFixed(2) : '—'} mm（纸帘修补只影响新版本，不回改历史）。
            </Alert>
            <RulerInput
              label="实测帘纹间距"
              value={reviseGap}
              onChange={setReviseGap}
              min={0.1}
              max={5}
              step={0.01}
              testId="field-reviseGap"
              helperText={reviseTarget ? getGapConclusion(reviseGap - (mouldById.get(reviseTarget.mouldId)?.stripeGap ?? reviseGap)) : ''}
            />
            <TextField
              fullWidth
              label="更正原因"
              value={reviseReason}
              onChange={(event) => setReviseReason(event.target.value)}
              placeholder="例如：成纸偏密，复测修正间距"
              inputProps={{ 'data-testid': 'field-reviseReason' }}
              required
            />
            {dialogError && <Alert severity="warning">{dialogError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviseTarget(null)}>取消</Button>
          <Button variant="contained" onClick={handleRevise} data-testid="submit-revise">生成修订版</Button>
        </DialogActions>
      </Dialog>

      {/* 作废 */}
      <Dialog open={voidTarget !== null} onClose={() => setVoidTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>作废版本 · {voidTarget?.runNo} v{voidTarget?.versionNo ?? 1}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Alert severity="warning">
              作废后该版本仍可在版本链中查询；引用该版本的样本会标明「失效」。
              作废最新有效版后，统计以剩余最新有效版为准。
            </Alert>
            <TextField
              fullWidth
              label="作废原因"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="例如：复测记录抄录有误"
              inputProps={{ 'data-testid': 'field-voidReason' }}
              required
            />
            {dialogError && <Alert severity="warning">{dialogError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoidTarget(null)}>取消</Button>
          <Button variant="contained" color="warning" onClick={handleVoid} data-testid="submit-void">确认作废</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

/** 表格主体：正常 / 冲突 / 全作废三种形态 + 可展开的版本链。 */
function FragmentGroup(props: {
  group: RunGroup
  expanded: boolean
  exceeded: boolean
  mouldNo?: string
  batchNo?: string
  batchMaterial?: string
  frameW?: number
  frameH?: number
  cmToMm: (value: number) => number
  deviation: number | null
  onToggle: () => void
  onRevise: (version: SheetRun) => void
  onVoid: (version: SheetRun) => void
  renderVersionRow: (group: RunGroup, version: SheetRun) => ReactNode
}) {
  const { group } = props
  const current = group.current

  if (group.conflicted) {
    return (
      <>
        <TableRow data-testid="row-run-conflict" hover sx={{ bgcolor: '#fff3cd' }}>
          <TableCell>
            <Typography sx={{ fontWeight: 750 }}>{group.runNo}</Typography>
            <Chip size="small" color="warning" label="并列有效版" sx={{ mt: 0.5 }} />
          </TableCell>
          <TableCell colSpan={4}>
            <Typography variant="body2" color="warning.dark">
              该槽存在 {group.versions.filter((version) => !version.voided).length} 个并列有效版本，已停止计入统计。
            </Typography>
            <Typography variant="caption" color="text.secondary">请展开版本链核对，作废多余版本后自动恢复统计。</Typography>
          </TableCell>
          <TableCell align="right">
            <Button size="small" onClick={props.onToggle}>{props.expanded ? '收起版本链' : '查看版本链'}</Button>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
            <Collapse in={props.expanded} timeout="auto" unmountOnExit>
              <VersionChain group={group} renderVersionRow={props.renderVersionRow} />
            </Collapse>
          </TableCell>
        </TableRow>
      </>
    )
  }

  if (group.allVoided) {
    return (
      <>
        <TableRow data-testid="row-run-voided" hover sx={{ bgcolor: '#f1ede4' }}>
          <TableCell>
            <Typography sx={{ fontWeight: 750 }}>{group.runNo}</Typography>
            <Chip size="small" label="全部作废" sx={{ mt: 0.5 }} />
          </TableCell>
          <TableCell colSpan={4}>
            <Typography variant="body2" color="text.secondary">该槽所有版本均已作废，仅留档可查，不计入统计。</Typography>
          </TableCell>
          <TableCell align="right">
            <Button size="small" onClick={props.onToggle}>{props.expanded ? '收起版本链' : '查看版本链'}</Button>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
            <Collapse in={props.expanded} timeout="auto" unmountOnExit>
              <VersionChain group={group} renderVersionRow={props.renderVersionRow} />
            </Collapse>
          </TableCell>
        </TableRow>
      </>
    )
  }

  if (!current) return null

  return (
    <>
      <TableRow data-testid="row-run" hover sx={{ bgcolor: props.exceeded ? '#fff7d9' : undefined }}>
        <TableCell>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
            <Typography sx={{ fontWeight: 750 }}>{current.runNo}</Typography>
            <Chip size="small" variant="outlined" label={`v${current.versionNo ?? 1}`} />
            {group.voidedCount > 0 && <Chip size="small" color="default" label={`作废 ${group.voidedCount} 版`} />}
          </Stack>
          <Typography variant="caption" color="text.secondary">{current.runDate} · {current.operator}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2">{props.mouldNo ?? '未关联纸帘'}</Typography>
          <Typography variant="caption" color="text.secondary">{props.batchNo ?? '未关联料批'} · {props.batchMaterial ?? '待补'}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2">{current.stripeDirection} · 荡料 {current.dipCount} 次</Typography>
          <Typography variant="caption" color="text.secondary">
            叠高 {current.stackHeight} 张 · {current.dryMethod} · 帘框 {props.frameW ? props.cmToMm(props.frameW) : '—'} × {props.frameH ? props.cmToMm(props.frameH) : '—'} mm
          </Typography>
        </TableCell>
        <TableCell align="right">{current.grammage} g/m²</TableCell>
        <TableCell sx={{ minWidth: 230 }}>
          <Typography variant="body2">实测 {Number.isFinite(current.measuredGap) ? `${current.measuredGap.toFixed(2)} mm` : '—'}</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.4 }}>
            <Chip
              size="small"
              color={props.deviation === null ? 'default' : props.exceeded ? 'warning' : 'success'}
              variant={props.deviation === null ? 'outlined' : 'filled'}
              label={props.deviation === null ? '偏差待补' : `${props.deviation > 0 ? '+' : ''}${props.deviation.toFixed(2)} mm`}
            />
            <Typography variant="caption" color="text.secondary">标准 {current.standardGap === null || current.standardGap === undefined ? '—' : `${current.standardGap.toFixed(2)} mm`}</Typography>
          </Stack>
        </TableCell>
        <TableCell align="right">
          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
            <Button size="small" variant="outlined" onClick={props.onToggle}>
              {props.expanded ? '收起' : '版本链'}
            </Button>
            <Button size="small" variant="contained" onClick={() => props.onRevise(current)} data-testid={`revise-${current.id}`}>
              复测更正
            </Button>
            <Button size="small" color="warning" onClick={() => props.onVoid(current)} data-testid={`void-${current.id}`}>
              作废
            </Button>
          </Stack>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
          <Collapse in={props.expanded} timeout="auto" unmountOnExit>
            <VersionChain group={group} renderVersionRow={props.renderVersionRow} />
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

function VersionChain({ group, renderVersionRow }: { group: RunGroup; renderVersionRow: (group: RunGroup, version: SheetRun) => ReactNode }) {
  return (
    <Box sx={{ bgcolor: '#faf6ec', px: 2, py: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {group.runNo} 版本链（{group.versions.length} 版{group.conflicted ? ' · 存在并列有效版' : ''}）
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>版本 / 原因</TableCell>
            <TableCell>纸帘 / 料批</TableCell>
            <TableCell>实测 / 标准</TableCell>
            <TableCell>偏差</TableCell>
            <TableCell>抄纸信息</TableCell>
            <TableCell>状态 / 时间</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>{group.versions.map((version) => renderVersionRow(group, version))}</TableBody>
      </Table>
    </Box>
  )
}
